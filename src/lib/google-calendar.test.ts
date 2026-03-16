import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock googleapis before importing the module under test ──────────

const mockEventsList = vi.fn();
const mockEventsInsert = vi.fn();
const mockEventsGet = vi.fn();
const mockEventsPatch = vi.fn();
const mockEventsDelete = vi.fn();
const mockFreebusyQuery = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    calendar: () => ({
      events: {
        list: mockEventsList,
        insert: mockEventsInsert,
        get: mockEventsGet,
        patch: mockEventsPatch,
        delete: mockEventsDelete,
      },
      freebusy: {
        query: mockFreebusyQuery,
      },
    }),
  },
}));

vi.mock("google-auth-library", () => ({
  JWT: class MockJWT {
    constructor() {
      // no-op mock
    }
  },
}));

// Set env before importing
process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
  client_email: "test@test.iam.gserviceaccount.com",
  private_key: "fake-key",
});

import {
  listEvents,
  searchEventByName,
  checkAvailability,
  findAvailableSlots,
  createEvent,
  updateEvent,
  deleteEvent,
  getCalendarSummary,
} from "./google-calendar";

/** Extract hour from a bare local datetime string like "2026-03-18T10:30:00" */
function localHourOf(dt: string): number {
  return parseInt(dt.split("T")[1].split(":")[0], 10);
}

/** Parse a bare local datetime or ISO string to epoch ms for comparison */
function toEpoch(dt: string): number {
  return new Date(dt).getTime();
}

/**
 * Google Calendar Integration Tests
 *
 * Tests all calendar operations with mocked Google API responses.
 * Covers assignment criteria:
 * - Calendar CRUD operations (create, read, update, delete)
 * - Multi-participant scheduling (FreeBusy API)
 * - Conflict resolution (slot finding with busy times)
 * - Smart time handling (timezone awareness)
 */

describe("Google Calendar Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── listEvents ─────────────────────────────────────────────────────

  describe("listEvents", () => {
    it("returns mapped events from Google API", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-1",
              summary: "Team Standup",
              description: "Daily sync",
              start: { dateTime: "2026-03-18T09:00:00+05:30" },
              end: { dateTime: "2026-03-18T09:30:00+05:30" },
              attendees: [
                { email: "jashan@conci.in", displayName: "Jashan", responseStatus: "accepted" },
                { email: "deepak@conci.in", responseStatus: "needsAction" },
              ],
              location: "Conference Room A",
            },
          ],
        },
      });

      const events = await listEvents("jashan@conci.in", "2026-03-18", "2026-03-18", "Asia/Kolkata");

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: "event-1",
        summary: "Team Standup",
        description: "Daily sync",
        start: "2026-03-18T09:00:00+05:30",
        end: "2026-03-18T09:30:00+05:30",
        attendees: [
          { email: "jashan@conci.in", displayName: "Jashan", responseStatus: "accepted" },
          { email: "deepak@conci.in", displayName: undefined, responseStatus: "needsAction" },
        ],
        location: "Conference Room A",
        timezone: "Asia/Kolkata",
      });
    });

    it("handles empty calendar", async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });
      const events = await listEvents("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(events).toEqual([]);
    });

    it("handles null items response", async () => {
      mockEventsList.mockResolvedValue({ data: {} });
      const events = await listEvents("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(events).toEqual([]);
    });

    it("passes correct timeMin/timeMax for date-only strings", async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });
      await listEvents("jashan@conci.in", "2026-03-18", "2026-03-20", "Asia/Kolkata");

      expect(mockEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          singleEvents: true,
          orderBy: "startTime",
          timeZone: "Asia/Kolkata",
        })
      );

      const call = mockEventsList.mock.calls[0][0];
      // toTimeMin/toTimeMax parse "YYYY-MM-DD" as local time then call toISOString()
      // The exact UTC offset depends on the test machine's timezone,
      // but they should be valid ISO strings
      expect(call.timeMin).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(call.timeMax).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // timeMin should be at midnight (start of day)
      expect(new Date(call.timeMin).getHours() === 0 || call.timeMin.includes("T00:00:00") || call.timeMin.includes("18:30")).toBe(true);
    });

    it("handles events with date-only (all-day events)", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "allday-1",
              summary: "Company Holiday",
              start: { date: "2026-03-18" },
              end: { date: "2026-03-19" },
              attendees: [],
            },
          ],
        },
      });

      const events = await listEvents("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(events[0].start).toBe("2026-03-18");
      expect(events[0].end).toBe("2026-03-19");
    });

    it("handles events with missing fields gracefully", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              // Minimal event — all optional fields missing
              start: { dateTime: "2026-03-18T10:00:00Z" },
              end: { dateTime: "2026-03-18T11:00:00Z" },
            },
          ],
        },
      });

      const events = await listEvents("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(events[0].id).toBe("");
      expect(events[0].summary).toBe("(No title)");
      expect(events[0].description).toBeUndefined();
      expect(events[0].location).toBeUndefined();
    });
  });

  // ─── searchEventByName ──────────────────────────────────────────────

  describe("searchEventByName", () => {
    it("searches by query string", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-2",
              summary: "Lunch with team",
              start: { dateTime: "2026-03-18T12:00:00Z" },
              end: { dateTime: "2026-03-18T13:00:00Z" },
              attendees: [],
            },
          ],
        },
      });

      const events = await searchEventByName("jashan@conci.in", "lunch");
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe("Lunch with team");
    });

    it("passes date range when provided", async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });
      await searchEventByName("jashan@conci.in", "meeting", "2026-03-18", "2026-03-20");

      const call = mockEventsList.mock.calls[0][0];
      expect(call.q).toBe("meeting");
      expect(call.timeMin).toBeDefined();
      expect(call.timeMax).toBeDefined();
    });

    it("omits date range when not provided", async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });
      await searchEventByName("jashan@conci.in", "meeting");

      const call = mockEventsList.mock.calls[0][0];
      expect(call.timeMin).toBeUndefined();
      expect(call.timeMax).toBeUndefined();
    });

    it("returns multiple matching events", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            { id: "e1", summary: "Team Meeting", start: { dateTime: "2026-03-18T09:00:00Z" }, end: { dateTime: "2026-03-18T10:00:00Z" }, attendees: [] },
            { id: "e2", summary: "Meeting Prep", start: { dateTime: "2026-03-18T08:00:00Z" }, end: { dateTime: "2026-03-18T08:30:00Z" }, attendees: [] },
          ],
        },
      });

      const events = await searchEventByName("jashan@conci.in", "meeting");
      expect(events).toHaveLength(2);
    });
  });

  // ─── checkAvailability ──────────────────────────────────────────────

  describe("checkAvailability", () => {
    it("returns busy slots for single participant", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [
                { start: "2026-03-18T09:00:00Z", end: "2026-03-18T10:00:00Z" },
                { start: "2026-03-18T14:00:00Z", end: "2026-03-18T15:00:00Z" },
              ],
            },
          },
        },
      });

      const results = await checkAvailability(
        ["jashan@conci.in"],
        "2026-03-18",
        "2026-03-18",
        "Asia/Kolkata"
      );

      expect(results).toHaveLength(1);
      expect(results[0].calendar).toBe("jashan@conci.in");
      expect(results[0].busy).toHaveLength(2);
    });

    it("returns busy slots for multiple participants", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [{ start: "2026-03-18T09:00:00Z", end: "2026-03-18T10:00:00Z" }],
            },
            "deepak@conci.in": {
              busy: [{ start: "2026-03-18T11:00:00Z", end: "2026-03-18T12:00:00Z" }],
            },
          },
        },
      });

      const results = await checkAvailability(
        ["jashan@conci.in", "deepak@conci.in"],
        "2026-03-18",
        "2026-03-18"
      );

      expect(results).toHaveLength(2);
      expect(results[0].calendar).toBe("jashan@conci.in");
      expect(results[1].calendar).toBe("deepak@conci.in");
    });

    it("handles participant with no busy slots", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": { busy: [] },
          },
        },
      });

      const results = await checkAvailability(
        ["jashan@conci.in"],
        "2026-03-18",
        "2026-03-18"
      );

      expect(results[0].busy).toEqual([]);
    });

    it("handles missing calendar data gracefully", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: { calendars: {} },
      });

      const results = await checkAvailability(
        ["unknown@conci.in"],
        "2026-03-18",
        "2026-03-18"
      );

      expect(results[0].busy).toEqual([]);
    });
  });

  // ─── findAvailableSlots ────────────────────────────────────────────

  describe("findAvailableSlots", () => {
    it("finds slots when calendar is completely free", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC"
      );

      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].participants).toEqual(["jashan@conci.in"]);
    });

    it("returns MULTIPLE spread-out slots, not just the earliest one", async () => {
      // Core bug that was caught: old algo returned only 1 slot per gap.
      // With a 9-hour window (9-18) and no meetings, we should get maxResults=5
      // slots spread across the day, not 5 back-to-back at 9 AM.
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        undefined,
        5
      );

      expect(slots).toHaveLength(5);
      // Returned slots must NOT overlap each other
      for (let i = 1; i < slots.length; i++) {
        const prevEnd = new Date(slots[i - 1].end).getTime();
        const currStart = new Date(slots[i].start).getTime();
        expect(currStart).toBeGreaterThanOrEqual(prevEnd);
      }
    });

    it("returned slots never overlap each other (dedup)", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        60,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        undefined,
        5
      );

      for (let i = 1; i < slots.length; i++) {
        const prevEnd = new Date(slots[i - 1].end).getTime();
        const currStart = new Date(slots[i].start).getTime();
        expect(currStart).toBeGreaterThanOrEqual(prevEnd);
      }
    });

    it("finds slots around busy periods", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [{ start: "2026-03-18T10:00:00Z", end: "2026-03-18T11:00:00Z" }],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC"
      );

      // Busy 10-11 UTC. Slots (bare local = UTC datetimes) should not overlap.
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        const startHour = localHourOf(slot.start);
        const endHour = localHourOf(slot.end);
        // Slot must end at or before 10, or start at or after 11
        expect(endHour <= 10 || startHour >= 11).toBe(true);
      }
    });

    it("finds slots in BOTH free gaps when busy period splits the day", async () => {
      // Busy 11-13 UTC, so there should be slots in 9-11 AND 13-18 UTC gaps
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [{ start: "2026-03-18T11:00:00Z", end: "2026-03-18T13:00:00Z" }],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        undefined,
        5
      );

      const hours = slots.map((s) => localHourOf(s.start));
      const hasMorning = hours.some((h) => h < 11);
      const hasAfternoon = hours.some((h) => h >= 13);
      expect(hasMorning).toBe(true);
      expect(hasAfternoon).toBe(true);
    });

    it("respects maxResults limit", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-20",
        "UTC",
        undefined,
        3
      );

      expect(slots.length).toBeLessThanOrEqual(3);
    });

    it("respects time-of-day preference (morning)", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        { preferredTimeOfDay: "morning" }
      );

      // With timezone="UTC", the working window is 8-12 local (= UTC)
      // Slots are now returned as bare local datetimes like "2026-03-18T10:00:00"
      for (const slot of slots) {
        const hour = localHourOf(slot.start);
        expect(hour).toBeGreaterThanOrEqual(8);
        expect(hour).toBeLessThan(12);
      }
    });

    it("respects time-of-day preference (afternoon)", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        { preferredTimeOfDay: "afternoon" }
      );

      // With timezone="UTC", the working window is 12-17 local (= UTC)
      for (const slot of slots) {
        const hour = localHourOf(slot.start);
        expect(hour).toBeGreaterThanOrEqual(12);
        expect(hour).toBeLessThan(17);
      }
    });

    it("excludes weekends by default", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-20",
        "2026-03-23",
        "UTC"
      );

      for (const slot of slots) {
        const day = new Date(slot.start).getUTCDay();
        expect(day).not.toBe(0);
        expect(day).not.toBe(6);
      }
    });

    it("returns empty when fully booked", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [{ start: "2026-03-17T18:00:00Z", end: "2026-03-18T21:30:00Z" }],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC"
      );

      expect(slots).toEqual([]);
    });

    it("handles multi-participant availability (merged busy timelines)", async () => {
      // Jashan busy 9-10 UTC, Deepak busy 10-11 UTC → merged busy = 9-11 UTC
      // With timezone="UTC", slots are returned as local (=UTC) datetimes
      // So all slots should have hour >= 11
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [{ start: "2026-03-18T09:00:00Z", end: "2026-03-18T10:00:00Z" }],
            },
            "deepak@conci.in": {
              busy: [{ start: "2026-03-18T10:00:00Z", end: "2026-03-18T11:00:00Z" }],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in", "deepak@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC"
      );

      // All slot start hours (local = UTC) should be >= 11
      for (const slot of slots) {
        expect(localHourOf(slot.start)).toBeGreaterThanOrEqual(11);
      }
    });

    it("handles same-day range (date_start === date_end)", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC"
      );

      expect(slots.length).toBeGreaterThan(0);
    });

    it("applies buffer minutes between meetings", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [{ start: "2026-03-18T10:00:00Z", end: "2026-03-18T11:00:00Z" }],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        { bufferMinutes: 15 }
      );

      // Busy 10-11 UTC + 15min buffer = effective busy until 11:15 UTC.
      // Slots after the busy period should start at 11:15 or later.
      for (const slot of slots) {
        const startHour = localHourOf(slot.start);
        const startMin = parseInt(slot.start.split(":")[1], 10);
        const startTotal = startHour * 60 + startMin;
        if (startTotal > 10 * 60) {
          // After the busy period: must be >= 11:15 (675 min from midnight)
          expect(startTotal).toBeGreaterThanOrEqual(11 * 60 + 15);
        }
      }
    });

    it("handles heavily fragmented day (many small meetings)", async () => {
      // Simulate a realistic day: standup 9-9:30, review 11-11:30, lunch 12:30-13:30, call 15-15:30
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [
                { start: "2026-03-18T09:00:00Z", end: "2026-03-18T09:30:00Z" },
                { start: "2026-03-18T11:00:00Z", end: "2026-03-18T11:30:00Z" },
                { start: "2026-03-18T12:30:00Z", end: "2026-03-18T13:30:00Z" },
                { start: "2026-03-18T15:00:00Z", end: "2026-03-18T15:30:00Z" },
              ],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        60,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        undefined,
        5
      );

      // Should find 1-hour slots in the gaps: 9:30-11 (90min), 11:30-12:30 (60min), 13:30-15 (90min), 15:30-18 (150min)
      expect(slots.length).toBeGreaterThanOrEqual(3);
      for (const slot of slots) {
        const dur = (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000;
        expect(dur).toBe(60);
      }
    });

    it("slots are sorted chronologically in final output", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        undefined,
        5
      );

      for (let i = 1; i < slots.length; i++) {
        expect(new Date(slots[i].start).getTime()).toBeGreaterThan(
          new Date(slots[i - 1].start).getTime()
        );
      }
    });

    it("each returned slot has correct duration", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: { "jashan@conci.in": { busy: [] } },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in"],
        45,
        "2026-03-18",
        "2026-03-18",
        "UTC",
        undefined,
        3
      );

      for (const slot of slots) {
        const dur = (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000;
        expect(dur).toBe(45);
      }
    });

    it("handles overlapping busy slots from multiple participants", async () => {
      // Jashan busy 9-11 UTC, Deepak busy 10-12 UTC → merged = 9-12 UTC
      // With timezone="UTC", all returned slot hours should be >= 12
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [{ start: "2026-03-18T09:00:00Z", end: "2026-03-18T11:00:00Z" }],
            },
            "deepak@conci.in": {
              busy: [{ start: "2026-03-18T10:00:00Z", end: "2026-03-18T12:00:00Z" }],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in", "deepak@conci.in"],
        30,
        "2026-03-18",
        "2026-03-18",
        "UTC"
      );

      for (const slot of slots) {
        expect(localHourOf(slot.start)).toBeGreaterThanOrEqual(12);
      }
    });

    // ── THE timezone bug that caused wrong slots in production ──
    it("uses timezone-aware working window (IST on UTC server)", async () => {
      // This is the exact bug: Cloud Run runs in UTC.
      // Jashan has Design Sync at 10:00 AM IST (= 04:30 UTC) on Tuesday.
      // Old code did setHours(9) in UTC → 9 AM UTC = 2:30 PM IST.
      // So it never saw the 10 AM IST meeting as conflicting.
      //
      // With timezone="Asia/Kolkata", the working window should be:
      //   9 AM IST = 03:30 UTC → 6 PM IST = 12:30 UTC
      // And the busy slot at 04:30 UTC (10 AM IST) must be respected.

      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "jashan@conci.in": {
              busy: [
                // 10:00-10:30 AM IST = 04:30-05:00 UTC
                { start: "2026-03-17T04:30:00Z", end: "2026-03-17T05:00:00Z" },
              ],
            },
            "deepak@conci.in": {
              busy: [],
            },
          },
        },
      });

      const slots = await findAvailableSlots(
        ["jashan@conci.in", "deepak@conci.in"],
        30,
        "2026-03-17",
        "2026-03-17",
        "Asia/Kolkata",
        undefined,
        5
      );

      // Slots are now bare local datetimes in Asia/Kolkata.
      // None should overlap with the 10:00-10:30 AM IST busy period.
      for (const slot of slots) {
        const startHour = localHourOf(slot.start);
        const endHour = localHourOf(slot.end);
        // Slot shouldn't be the 10:00 slot (which overlaps with 10:00-10:30 busy)
        const overlapsBusy = startHour === 10 && parseInt(slot.start.split(":")[1]) < 30;
        expect(overlapsBusy).toBe(false);
      }

      // Working window is 9 AM - 6 PM IST, so all slot hours should be in [9, 18)
      for (const slot of slots) {
        const hour = localHourOf(slot.start);
        expect(hour).toBeGreaterThanOrEqual(9);
        expect(hour).toBeLessThan(18);
      }
    });
  });

  // ─── createEvent ───────────────────────────────────────────────────

  describe("createEvent", () => {
    it("creates an event with correct parameters", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "new-event-1",
          summary: "Team Sync",
          start: { dateTime: "2026-03-18T10:30:00+05:30" },
          end: { dateTime: "2026-03-18T11:00:00+05:30" },
          attendees: [
            { email: "deepak@conci.in", responseStatus: "needsAction" },
          ],
        },
      });

      const event = await createEvent({
        title: "Team Sync",
        startTime: "2026-03-18T10:30:00",
        durationMinutes: 30,
        attendees: ["deepak@conci.in"],
        timezone: "Asia/Kolkata",
        organizerEmail: "jashan@conci.in",
      });

      expect(event.id).toBe("new-event-1");
      expect(event.summary).toBe("Team Sync");
      expect(event.timezone).toBe("Asia/Kolkata");

      // Verify the request sent to Google
      const insertCall = mockEventsInsert.mock.calls[0][0];
      expect(insertCall.requestBody.summary).toBe("Team Sync");
      expect(insertCall.requestBody.attendees).toEqual([{ email: "deepak@conci.in" }]);
      expect(insertCall.sendUpdates).toBe("all");
    });

    it("preserves bare datetime (no UTC conversion) for timezone-aware scheduling", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "tz-event",
          summary: "Meeting",
          start: { dateTime: "2026-03-18T10:30:00+05:30" },
          end: { dateTime: "2026-03-18T11:00:00+05:30" },
          attendees: [],
        },
      });

      await createEvent({
        title: "Meeting",
        startTime: "2026-03-18T10:30:00", // bare datetime, no timezone
        durationMinutes: 30,
        attendees: [],
        timezone: "Asia/Kolkata",
        organizerEmail: "jashan@conci.in",
      });

      const insertCall = mockEventsInsert.mock.calls[0][0];
      // Start time should be the bare datetime, NOT converted to UTC
      expect(insertCall.requestBody.start.dateTime).toBe("2026-03-18T10:30:00");
      expect(insertCall.requestBody.start.timeZone).toBe("Asia/Kolkata");
    });

    it("creates event with description", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "desc-event",
          summary: "Planning",
          description: "Sprint planning session",
          start: { dateTime: "2026-03-18T14:00:00Z" },
          end: { dateTime: "2026-03-18T15:00:00Z" },
          attendees: [],
        },
      });

      const event = await createEvent({
        title: "Planning",
        startTime: "2026-03-18T14:00:00Z",
        durationMinutes: 60,
        attendees: [],
        timezone: "UTC",
        description: "Sprint planning session",
        organizerEmail: "jashan@conci.in",
      });

      expect(event.description).toBe("Sprint planning session");
    });

    it("creates event with no attendees", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "solo-event",
          summary: "Focus Time",
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T11:00:00Z" },
          attendees: [],
        },
      });

      const event = await createEvent({
        title: "Focus Time",
        startTime: "2026-03-18T10:00:00Z",
        durationMinutes: 60,
        attendees: [],
        timezone: "UTC",
        organizerEmail: "jashan@conci.in",
      });

      expect(event.attendees).toEqual([]);
    });

    it("computes correct end time for bare local datetime (no timezone drift)", async () => {
      // This test verifies that end time is computed via string arithmetic,
      // not via new Date() which interprets bare datetimes as local time
      // and produces wrong results when server TZ ≠ event TZ.
      //
      // Input: startTime = "2026-03-18T10:30:00" (bare), duration = 90 min
      // Expected end: "2026-03-18T12:00:00" (bare)
      // Bug (old code): new Date("2026-03-18T10:30:00") on IST machine →
      //   10:30 IST = 05:00 UTC → getUTCHours() = 5 → end = "T06:30:00" ✗

      mockEventsInsert.mockResolvedValue({
        data: {
          id: "tz-safe",
          summary: "Test",
          start: { dateTime: "2026-03-18T10:30:00+05:30" },
          end: { dateTime: "2026-03-18T12:00:00+05:30" },
          attendees: [],
        },
      });

      await createEvent({
        title: "Test",
        startTime: "2026-03-18T10:30:00",
        durationMinutes: 90,
        attendees: [],
        timezone: "Asia/Kolkata",
        organizerEmail: "jashan@conci.in",
      });

      const insertCall = mockEventsInsert.mock.calls[0][0];
      expect(insertCall.requestBody.start.dateTime).toBe("2026-03-18T10:30:00");
      expect(insertCall.requestBody.end.dateTime).toBe("2026-03-18T12:00:00");
    });

    it("computes end time that rolls over to next day correctly", async () => {
      // 11 PM + 120 min = 1 AM next day
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "rollover",
          summary: "Late Night",
          start: { dateTime: "2026-03-18T23:00:00+05:30" },
          end: { dateTime: "2026-03-19T01:00:00+05:30" },
          attendees: [],
        },
      });

      await createEvent({
        title: "Late Night",
        startTime: "2026-03-18T23:00:00",
        durationMinutes: 120,
        attendees: [],
        timezone: "Asia/Kolkata",
        organizerEmail: "jashan@conci.in",
      });

      const insertCall = mockEventsInsert.mock.calls[0][0];
      expect(insertCall.requestBody.end.dateTime).toBe("2026-03-19T01:00:00");
    });

    it("preserves ISO end time when start has offset", async () => {
      // When startTime already has offset/Z, pass through to toISOString
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "iso-event",
          summary: "ISO",
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T10:30:00Z" },
          attendees: [],
        },
      });

      await createEvent({
        title: "ISO",
        startTime: "2026-03-18T10:00:00Z",
        durationMinutes: 30,
        attendees: [],
        timezone: "UTC",
        organizerEmail: "jashan@conci.in",
      });

      const insertCall = mockEventsInsert.mock.calls[0][0];
      // Should be a valid ISO string ending with Z
      expect(insertCall.requestBody.end.dateTime).toMatch(/Z$/);
    });

    it("creates event with multiple attendees", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "multi-event",
          summary: "All Hands",
          start: { dateTime: "2026-03-18T15:00:00Z" },
          end: { dateTime: "2026-03-18T16:00:00Z" },
          attendees: [
            { email: "deepak@conci.in", responseStatus: "needsAction" },
            { email: "monica@conci.in", responseStatus: "needsAction" },
          ],
        },
      });

      const event = await createEvent({
        title: "All Hands",
        startTime: "2026-03-18T15:00:00Z",
        durationMinutes: 60,
        attendees: ["deepak@conci.in", "monica@conci.in"],
        timezone: "UTC",
        organizerEmail: "jashan@conci.in",
      });

      expect(event.attendees).toHaveLength(2);
    });
  });

  // ─── updateEvent ───────────────────────────────────────────────────

  describe("updateEvent", () => {
    it("updates event title", async () => {
      mockEventsGet.mockResolvedValue({
        data: {
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T11:00:00Z" },
        },
      });
      mockEventsPatch.mockResolvedValue({
        data: {
          id: "event-1",
          summary: "Renamed Meeting",
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T11:00:00Z" },
          attendees: [],
        },
      });

      const event = await updateEvent({
        eventId: "event-1",
        userEmail: "jashan@conci.in",
        newTitle: "Renamed Meeting",
      });

      expect(event.summary).toBe("Renamed Meeting");
      const patchCall = mockEventsPatch.mock.calls[0][0];
      expect(patchCall.requestBody.summary).toBe("Renamed Meeting");
    });

    it("reschedules event to new time", async () => {
      mockEventsGet.mockResolvedValue({
        data: {
          start: { dateTime: "2026-03-18T10:00:00+05:30", timeZone: "Asia/Kolkata" },
          end: { dateTime: "2026-03-18T11:00:00+05:30", timeZone: "Asia/Kolkata" },
        },
      });
      mockEventsPatch.mockResolvedValue({
        data: {
          id: "event-1",
          summary: "Meeting",
          start: { dateTime: "2026-03-19T14:00:00+05:30" },
          end: { dateTime: "2026-03-19T15:00:00+05:30" },
          attendees: [],
        },
      });

      const event = await updateEvent({
        eventId: "event-1",
        userEmail: "jashan@conci.in",
        newStartTime: "2026-03-19T14:00:00",
      });

      const patchCall = mockEventsPatch.mock.calls[0][0];
      expect(patchCall.requestBody.start.dateTime).toBe("2026-03-19T14:00:00");
      expect(patchCall.requestBody.start.timeZone).toBe("Asia/Kolkata");
    });

    it("updates duration only (keeps start time)", async () => {
      mockEventsGet.mockResolvedValue({
        data: {
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T11:00:00Z" },
        },
      });
      mockEventsPatch.mockResolvedValue({
        data: {
          id: "event-1",
          summary: "Meeting",
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T11:30:00Z" },
          attendees: [],
        },
      });

      await updateEvent({
        eventId: "event-1",
        userEmail: "jashan@conci.in",
        newDurationMinutes: 90,
      });

      const patchCall = mockEventsPatch.mock.calls[0][0];
      expect(patchCall.requestBody.end).toBeDefined();
      // Start should not change
      expect(patchCall.requestBody.start).toBeUndefined();
    });

    it("computes correct end time for bare local datetime on reschedule", async () => {
      // Same bug as createEvent: end time must use string arithmetic, not new Date()
      mockEventsGet.mockResolvedValue({
        data: {
          start: { dateTime: "2026-03-18T10:00:00+05:30", timeZone: "Asia/Kolkata" },
          end: { dateTime: "2026-03-18T11:00:00+05:30", timeZone: "Asia/Kolkata" },
        },
      });
      mockEventsPatch.mockResolvedValue({
        data: {
          id: "event-1",
          summary: "Meeting",
          start: { dateTime: "2026-03-19T14:00:00+05:30", timeZone: "Asia/Kolkata" },
          end: { dateTime: "2026-03-19T15:30:00+05:30", timeZone: "Asia/Kolkata" },
          attendees: [],
        },
      });

      await updateEvent({
        eventId: "event-1",
        userEmail: "jashan@conci.in",
        newStartTime: "2026-03-19T14:00:00",
        newDurationMinutes: 90,
      });

      const patchCall = mockEventsPatch.mock.calls[0][0];
      expect(patchCall.requestBody.end.dateTime).toBe("2026-03-19T15:30:00");
    });

    it("sends update notifications to attendees", async () => {
      mockEventsGet.mockResolvedValue({
        data: {
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T11:00:00Z" },
        },
      });
      mockEventsPatch.mockResolvedValue({
        data: {
          id: "event-1",
          summary: "Meeting",
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T11:00:00Z" },
          attendees: [],
        },
      });

      await updateEvent({
        eventId: "event-1",
        userEmail: "jashan@conci.in",
        newTitle: "Updated",
      });

      const patchCall = mockEventsPatch.mock.calls[0][0];
      expect(patchCall.sendUpdates).toBe("all");
    });
  });

  // ─── deleteEvent ───────────────────────────────────────────────────

  describe("deleteEvent", () => {
    it("deletes event by ID", async () => {
      mockEventsDelete.mockResolvedValue({});

      await deleteEvent("event-1", "jashan@conci.in");

      expect(mockEventsDelete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "event-1",
        sendUpdates: "all",
      });
    });

    it("sends cancellation notifications", async () => {
      mockEventsDelete.mockResolvedValue({});
      await deleteEvent("event-1", "jashan@conci.in");

      const call = mockEventsDelete.mock.calls[0][0];
      expect(call.sendUpdates).toBe("all");
    });
  });

  // ─── getCalendarSummary ────────────────────────────────────────────

  describe("getCalendarSummary", () => {
    it("calculates summary statistics correctly", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "e1",
              summary: "Meeting 1",
              start: { dateTime: "2026-03-18T09:00:00Z" },
              end: { dateTime: "2026-03-18T10:00:00Z" },
              attendees: [],
            },
            {
              id: "e2",
              summary: "Meeting 2",
              start: { dateTime: "2026-03-18T10:00:00Z" },
              end: { dateTime: "2026-03-18T11:00:00Z" },
              attendees: [],
            },
            {
              id: "e3",
              summary: "Meeting 3",
              start: { dateTime: "2026-03-19T14:00:00Z" },
              end: { dateTime: "2026-03-19T15:00:00Z" },
              attendees: [],
            },
          ],
        },
      });

      const summary = await getCalendarSummary(
        "jashan@conci.in",
        "2026-03-18",
        "2026-03-19"
      );

      expect(summary.totalMeetings).toBe(3);
      expect(summary.totalMeetingHours).toBe(3);
      expect(summary.userEmail).toBe("jashan@conci.in");
    });

    it("detects back-to-back meetings (within 5 min gap)", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "e1",
              summary: "Meeting 1",
              start: { dateTime: "2026-03-18T09:00:00Z" },
              end: { dateTime: "2026-03-18T10:00:00Z" },
              attendees: [],
            },
            {
              id: "e2",
              summary: "Meeting 2",
              start: { dateTime: "2026-03-18T10:00:00Z" }, // Starts exactly when e1 ends
              end: { dateTime: "2026-03-18T11:00:00Z" },
              attendees: [],
            },
          ],
        },
      });

      const summary = await getCalendarSummary("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(summary.backToBackCount).toBe(1);
    });

    it("identifies busiest day", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            { id: "e1", summary: "M1", start: { dateTime: "2026-03-18T09:00:00Z" }, end: { dateTime: "2026-03-18T10:00:00Z" }, attendees: [] },
            { id: "e2", summary: "M2", start: { dateTime: "2026-03-18T11:00:00Z" }, end: { dateTime: "2026-03-18T12:00:00Z" }, attendees: [] },
            { id: "e3", summary: "M3", start: { dateTime: "2026-03-18T14:00:00Z" }, end: { dateTime: "2026-03-18T15:00:00Z" }, attendees: [] },
            { id: "e4", summary: "M4", start: { dateTime: "2026-03-19T10:00:00Z" }, end: { dateTime: "2026-03-19T11:00:00Z" }, attendees: [] },
          ],
        },
      });

      const summary = await getCalendarSummary("jashan@conci.in", "2026-03-18", "2026-03-19");
      expect(summary.busiestDay.date).toBe("2026-03-18");
      expect(summary.busiestDay.meetingCount).toBe(3);
    });

    it("detects overbooking (>70% of working hours)", async () => {
      // 1 day = 8 working hours. 6 hours of meetings = 75% → overbooked
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            { id: "e1", summary: "M1", start: { dateTime: "2026-03-18T09:00:00Z" }, end: { dateTime: "2026-03-18T12:00:00Z" }, attendees: [] },
            { id: "e2", summary: "M2", start: { dateTime: "2026-03-18T13:00:00Z" }, end: { dateTime: "2026-03-18T16:00:00Z" }, attendees: [] },
          ],
        },
      });

      const summary = await getCalendarSummary("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(summary.isOverbooked).toBe(true);
    });

    it("reports not overbooked when lightly loaded", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            { id: "e1", summary: "M1", start: { dateTime: "2026-03-18T09:00:00Z" }, end: { dateTime: "2026-03-18T10:00:00Z" }, attendees: [] },
          ],
        },
      });

      const summary = await getCalendarSummary("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(summary.isOverbooked).toBe(false);
    });

    it("handles empty calendar", async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });

      const summary = await getCalendarSummary("jashan@conci.in", "2026-03-18", "2026-03-18");
      expect(summary.totalMeetings).toBe(0);
      expect(summary.totalMeetingHours).toBe(0);
      expect(summary.backToBackCount).toBe(0);
      expect(summary.isOverbooked).toBe(false);
    });
  });
});
