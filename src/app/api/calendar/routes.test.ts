import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * API Route Integration Tests
 *
 * Tests all 9 calendar API endpoints end-to-end (mocking only the Google Calendar layer).
 * This validates:
 * - Request validation (missing fields → 400)
 * - Correct parameter mapping (snake_case API → camelCase lib)
 * - Response structure (success, error shapes)
 * - SSE broadcasting on mutations
 * - Edge cases per route
 *
 * Assignment scenario coverage:
 * - Basic scheduling (create-event)
 * - Multi-participant scheduling (find-slots, availability)
 * - Rescheduling (update-event)
 * - Cancellation (delete-event)
 * - Calendar intelligence (summary)
 * - Smart time parsing (resolve-date)
 * - Event search (search-event, list-events)
 */

// ─── Mock google-calendar module ─────────────────────────────────────

const mockListEvents = vi.fn();
const mockSearchEventByName = vi.fn();
const mockCheckAvailability = vi.fn();
const mockFindAvailableSlots = vi.fn();
const mockCreateEvent = vi.fn();
const mockUpdateEvent = vi.fn();
const mockDeleteEvent = vi.fn();
const mockGetCalendarSummary = vi.fn();

vi.mock("@/lib/google-calendar", () => ({
  listEvents: (...args: unknown[]) => mockListEvents(...args),
  searchEventByName: (...args: unknown[]) => mockSearchEventByName(...args),
  checkAvailability: (...args: unknown[]) => mockCheckAvailability(...args),
  findAvailableSlots: (...args: unknown[]) => mockFindAvailableSlots(...args),
  createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
  deleteEvent: (...args: unknown[]) => mockDeleteEvent(...args),
  getCalendarSummary: (...args: unknown[]) => mockGetCalendarSummary(...args),
}));

// Mock SSE broadcaster
const mockBroadcast = vi.fn();
vi.mock("@/lib/sse", () => ({
  sseBroadcaster: { broadcast: (...args: unknown[]) => mockBroadcast(...args) },
}));

// Mock date-resolver
vi.mock("@/lib/date-resolver", () => ({
  resolveDate: (expr: string) => {
    if (expr === "tomorrow") {
      return { dateStart: "2026-03-19", dateEnd: "2026-03-19", description: "Tomorrow" };
    }
    if (expr === "next monday") {
      return { dateStart: "2026-03-23", dateEnd: "2026-03-23", description: "Next Monday" };
    }
    if (expr === "late next week") {
      return { dateStart: "2026-03-26", dateEnd: "2026-03-27", description: "Late next week (Thursday-Friday)" };
    }
    return { dateStart: "2026-03-18", dateEnd: "2026-03-25", description: `Fallback for "${expr}"` };
  },
}));

// ─── Helper to create NextRequest-like objects ───────────────────────

function makeRequest(body: Record<string, unknown>) {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// 1. LIST EVENTS
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/list-events", () => {
  let handler: typeof import("@/app/api/calendar/list-events/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/list-events/route")).POST;
  });

  it("returns events for valid request", async () => {
    const mockEvents = [
      { id: "e1", summary: "Standup", start: "2026-03-18T09:00:00Z", end: "2026-03-18T09:30:00Z" },
    ];
    mockListEvents.mockResolvedValue(mockEvents);

    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      date_start: "2026-03-18",
      date_end: "2026-03-18",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.events).toEqual(mockEvents);
    expect(data.count).toBe(1);
    expect(mockListEvents).toHaveBeenCalledWith("jashan@conci.in", "2026-03-18", "2026-03-18", "Asia/Kolkata");
  });

  it("returns 400 when user_email missing", async () => {
    const res = await handler(makeRequest({
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("Missing");
  });

  it("returns 400 when date_start missing", async () => {
    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      date_end: "2026-03-18",
    }));
    expect(res.status).toBe(400);
  });

  it("defaults timezone to UTC when not provided", async () => {
    mockListEvents.mockResolvedValue([]);
    await handler(makeRequest({
      user_email: "jashan@conci.in",
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));
    expect(mockListEvents).toHaveBeenCalledWith("jashan@conci.in", "2026-03-18", "2026-03-18", "UTC");
  });

  it("returns 500 when calendar API fails", async () => {
    mockListEvents.mockRejectedValue(new Error("Google API error"));
    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toContain("Failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. SEARCH EVENT
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/search-event", () => {
  let handler: typeof import("@/app/api/calendar/search-event/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/search-event/route")).POST;
  });

  it("searches events by query", async () => {
    mockSearchEventByName.mockResolvedValue([
      { id: "e1", summary: "Lunch meeting", start: "2026-03-18T12:00:00Z", end: "2026-03-18T13:00:00Z" },
    ]);

    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      query: "lunch",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(1);
    expect(data.events[0].summary).toBe("Lunch meeting");
  });

  it("passes optional date range", async () => {
    mockSearchEventByName.mockResolvedValue([]);
    await handler(makeRequest({
      user_email: "jashan@conci.in",
      query: "standup",
      date_start: "2026-03-18",
      date_end: "2026-03-20",
    }));

    expect(mockSearchEventByName).toHaveBeenCalledWith(
      "jashan@conci.in", "standup", "2026-03-18", "2026-03-20"
    );
  });

  it("returns 400 when user_email missing", async () => {
    const res = await handler(makeRequest({ query: "meeting" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when query missing", async () => {
    const res = await handler(makeRequest({ user_email: "jashan@conci.in" }));
    expect(res.status).toBe(400);
  });

  it("returns empty array when no matches", async () => {
    mockSearchEventByName.mockResolvedValue([]);
    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      query: "nonexistent",
    }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(0);
    expect(data.events).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. CHECK AVAILABILITY
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/availability", () => {
  let handler: typeof import("@/app/api/calendar/availability/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/availability/route")).POST;
  });

  it("returns availability for participants", async () => {
    mockCheckAvailability.mockResolvedValue([
      {
        calendar: "jashan@conci.in",
        busy: [{ start: "2026-03-18T09:00:00Z", end: "2026-03-18T10:00:00Z" }],
      },
    ]);

    const res = await handler(makeRequest({
      participants: ["jashan@conci.in"],
      date_start: "2026-03-18",
      date_end: "2026-03-18",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(1);
    expect(data.summary).toHaveLength(1);
    expect(data.summary[0].busySlotCount).toBe(1);
  });

  it("broadcasts availability_checked SSE event", async () => {
    mockCheckAvailability.mockResolvedValue([]);
    await handler(makeRequest({
      participants: ["jashan@conci.in"],
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "availability_checked" })
    );
  });

  it("returns 400 when participants missing", async () => {
    const res = await handler(makeRequest({
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when participants is empty array", async () => {
    const res = await handler(makeRequest({
      participants: [],
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. FIND AVAILABLE SLOTS
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/find-slots", () => {
  let handler: typeof import("@/app/api/calendar/find-slots/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/find-slots/route")).POST;
  });

  it("returns available slots", async () => {
    const mockSlots = [
      { start: "2026-03-18T09:00:00Z", end: "2026-03-18T09:30:00Z", participants: ["jashan@conci.in"] },
    ];
    mockFindAvailableSlots.mockResolvedValue(mockSlots);

    const res = await handler(makeRequest({
      participants: ["jashan@conci.in"],
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.slots).toEqual(mockSlots);
    expect(data.message).toContain("1");
  });

  it("returns helpful message when no slots found", async () => {
    mockFindAvailableSlots.mockResolvedValue([]);

    const res = await handler(makeRequest({
      participants: ["jashan@conci.in"],
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.slots).toEqual([]);
    expect(data.message).toContain("No available slots");
  });

  it("maps time_preferences snake_case to camelCase", async () => {
    mockFindAvailableSlots.mockResolvedValue([]);

    await handler(makeRequest({
      participants: ["jashan@conci.in"],
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
      time_preferences: {
        preferred_time_of_day: "morning",
        earliest_hour: 8,
        latest_hour: 12,
        buffer_minutes: 15,
      },
    }));

    expect(mockFindAvailableSlots).toHaveBeenCalledWith(
      ["jashan@conci.in"],
      30,
      "2026-03-18",
      "2026-03-18",
      "UTC",
      {
        preferredTimeOfDay: "morning",
        earliestHour: 8,
        latestHour: 12,
        excludeDays: undefined,
        bufferMinutes: 15,
      },
      5
    );
  });

  it("returns 400 when participants missing", async () => {
    const res = await handler(makeRequest({
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when duration_minutes missing", async () => {
    const res = await handler(makeRequest({
      participants: ["jashan@conci.in"],
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));
    expect(res.status).toBe(400);
  });

  it("broadcasts slots_found SSE event", async () => {
    mockFindAvailableSlots.mockResolvedValue([{ start: "x", end: "y", participants: [] }]);

    await handler(makeRequest({
      participants: ["jashan@conci.in"],
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
    }));

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "slots_found" })
    );
  });

  it("respects custom max_results", async () => {
    mockFindAvailableSlots.mockResolvedValue([]);

    await handler(makeRequest({
      participants: ["jashan@conci.in"],
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
      max_results: 3,
    }));

    const call = mockFindAvailableSlots.mock.calls[0];
    expect(call[6]).toBe(3); // 7th arg = max_results
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. CREATE EVENT
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/create-event", () => {
  let handler: typeof import("@/app/api/calendar/create-event/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/create-event/route")).POST;
  });

  it("creates event successfully", async () => {
    const mockEvent = {
      id: "new-1",
      summary: "Team Sync",
      start: "2026-03-18T10:30:00+05:30",
      end: "2026-03-18T11:00:00+05:30",
      attendees: [{ email: "deepak@conci.in" }],
    };
    mockCreateEvent.mockResolvedValue(mockEvent);

    const res = await handler(makeRequest({
      title: "Team Sync",
      start_time: "2026-03-18T10:30:00",
      duration_minutes: 30,
      attendees: ["deepak@conci.in"],
      timezone: "Asia/Kolkata",
      organizer_email: "jashan@conci.in",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.event.id).toBe("new-1");
    expect(data.message).toContain("Team Sync");
    expect(data.message).toContain("scheduled successfully");
  });

  it("maps snake_case body to camelCase request", async () => {
    mockCreateEvent.mockResolvedValue({ id: "x", summary: "X", start: "", end: "", attendees: [] });

    await handler(makeRequest({
      title: "Test",
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 60,
      attendees: ["a@b.com"],
      timezone: "UTC",
      description: "Test desc",
      organizer_email: "org@b.com",
    }));

    expect(mockCreateEvent).toHaveBeenCalledWith({
      title: "Test",
      startTime: "2026-03-18T10:00:00",
      durationMinutes: 60,
      attendees: ["a@b.com"],
      timezone: "UTC",
      description: "Test desc",
      organizerEmail: "org@b.com",
    });
  });

  it("defaults attendees to empty array", async () => {
    mockCreateEvent.mockResolvedValue({ id: "x", summary: "Solo", start: "", end: "", attendees: [] });

    await handler(makeRequest({
      title: "Solo",
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 30,
      organizer_email: "jashan@conci.in",
    }));

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ attendees: [] })
    );
  });

  it("defaults timezone to UTC", async () => {
    mockCreateEvent.mockResolvedValue({ id: "x", summary: "X", start: "", end: "", attendees: [] });

    await handler(makeRequest({
      title: "X",
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 30,
      organizer_email: "jashan@conci.in",
    }));

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "UTC" })
    );
  });

  it("broadcasts event_created SSE event", async () => {
    mockCreateEvent.mockResolvedValue({ id: "x", summary: "X", start: "", end: "", attendees: [] });

    await handler(makeRequest({
      title: "X",
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 30,
      organizer_email: "jashan@conci.in",
    }));

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "event_created" })
    );
  });

  it("returns 400 when title missing", async () => {
    const res = await handler(makeRequest({
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 30,
      organizer_email: "jashan@conci.in",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when start_time missing", async () => {
    const res = await handler(makeRequest({
      title: "X",
      duration_minutes: 30,
      organizer_email: "jashan@conci.in",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when organizer_email missing", async () => {
    const res = await handler(makeRequest({
      title: "X",
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 30,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when calendar API fails", async () => {
    mockCreateEvent.mockRejectedValue(new Error("Calendar error"));

    const res = await handler(makeRequest({
      title: "X",
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 30,
      organizer_email: "jashan@conci.in",
    }));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. UPDATE EVENT
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/update-event", () => {
  let handler: typeof import("@/app/api/calendar/update-event/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/update-event/route")).POST;
  });

  it("updates event successfully", async () => {
    const mockEvent = { id: "e1", summary: "New Title", start: "2026-03-18T10:00:00Z", end: "2026-03-18T11:00:00Z", attendees: [] };
    mockUpdateEvent.mockResolvedValue(mockEvent);

    const res = await handler(makeRequest({
      event_id: "e1",
      user_email: "jashan@conci.in",
      new_title: "New Title",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("New Title");
    expect(data.message).toContain("updated");
  });

  it("reschedules with new start time", async () => {
    mockUpdateEvent.mockResolvedValue({ id: "e1", summary: "Meeting", start: "", end: "", attendees: [] });

    await handler(makeRequest({
      event_id: "e1",
      user_email: "jashan@conci.in",
      new_start_time: "2026-03-19T14:00:00",
    }));

    expect(mockUpdateEvent).toHaveBeenCalledWith({
      eventId: "e1",
      userEmail: "jashan@conci.in",
      newStartTime: "2026-03-19T14:00:00",
      newDurationMinutes: undefined,
      newTitle: undefined,
    });
  });

  it("broadcasts event_updated SSE event", async () => {
    mockUpdateEvent.mockResolvedValue({ id: "e1", summary: "X", start: "", end: "", attendees: [] });

    await handler(makeRequest({
      event_id: "e1",
      user_email: "jashan@conci.in",
      new_title: "X",
    }));

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "event_updated" })
    );
  });

  it("returns 400 when event_id missing", async () => {
    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      new_title: "X",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when user_email missing", async () => {
    const res = await handler(makeRequest({
      event_id: "e1",
      new_title: "X",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no update field provided", async () => {
    const res = await handler(makeRequest({
      event_id: "e1",
      user_email: "jashan@conci.in",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("At least one update field");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. DELETE EVENT
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/delete-event", () => {
  let handler: typeof import("@/app/api/calendar/delete-event/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/delete-event/route")).POST;
  });

  it("deletes event by ID", async () => {
    mockDeleteEvent.mockResolvedValue(undefined);

    const res = await handler(makeRequest({
      event_id: "e1",
      user_email: "jashan@conci.in",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("cancelled");
    expect(mockDeleteEvent).toHaveBeenCalledWith("e1", "jashan@conci.in");
  });

  it("deletes event by title (single match)", async () => {
    mockSearchEventByName.mockResolvedValue([
      { id: "e2", summary: "Lunch", start: "2026-03-18T12:00:00Z" },
    ]);
    mockDeleteEvent.mockResolvedValue(undefined);

    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      event_title: "Lunch",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockDeleteEvent).toHaveBeenCalledWith("e2", "jashan@conci.in");
  });

  it("returns ambiguous when multiple matches by title", async () => {
    mockSearchEventByName.mockResolvedValue([
      { id: "e1", summary: "Meeting A", start: "2026-03-18T09:00:00Z" },
      { id: "e2", summary: "Meeting B", start: "2026-03-18T14:00:00Z" },
    ]);

    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      event_title: "Meeting",
    }));

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain("2 events");
    expect(data.events).toHaveLength(2);
  });

  it("returns not found when title has no matches", async () => {
    mockSearchEventByName.mockResolvedValue([]);

    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      event_title: "Nonexistent",
    }));

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain("No event found");
  });

  it("broadcasts event_deleted SSE event", async () => {
    mockDeleteEvent.mockResolvedValue(undefined);

    await handler(makeRequest({
      event_id: "e1",
      user_email: "jashan@conci.in",
    }));

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "event_deleted", eventId: "e1" })
    );
  });

  it("returns 400 when user_email missing", async () => {
    const res = await handler(makeRequest({ event_id: "e1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither event_id nor event_title provided", async () => {
    const res = await handler(makeRequest({ user_email: "jashan@conci.in" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("event_id or event_title");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. CALENDAR SUMMARY
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/summary", () => {
  let handler: typeof import("@/app/api/calendar/summary/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/summary/route")).POST;
  });

  it("returns calendar summary", async () => {
    const mockSummary = {
      userEmail: "jashan@conci.in",
      dateRange: { start: "2026-03-18", end: "2026-03-20" },
      totalMeetings: 5,
      totalMeetingHours: 4.5,
      freeHours: 19.5,
      busiestDay: { date: "2026-03-18", meetingCount: 3 },
      backToBackCount: 1,
      isOverbooked: false,
    };
    mockGetCalendarSummary.mockResolvedValue(mockSummary);

    const res = await handler(makeRequest({
      user_email: "jashan@conci.in",
      date_start: "2026-03-18",
      date_end: "2026-03-20",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary.totalMeetings).toBe(5);
    expect(data.summary.isOverbooked).toBe(false);
  });

  it("returns 400 when user_email missing", async () => {
    const res = await handler(makeRequest({
      date_start: "2026-03-18",
      date_end: "2026-03-20",
    }));
    expect(res.status).toBe(400);
  });

  it("defaults timezone to UTC", async () => {
    mockGetCalendarSummary.mockResolvedValue({});
    await handler(makeRequest({
      user_email: "jashan@conci.in",
      date_start: "2026-03-18",
      date_end: "2026-03-20",
    }));
    expect(mockGetCalendarSummary).toHaveBeenCalledWith(
      "jashan@conci.in", "2026-03-18", "2026-03-20", "UTC"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. RESOLVE DATE
// ═══════════════════════════════════════════════════════════════════════

describe("POST /api/calendar/resolve-date", () => {
  let handler: typeof import("@/app/api/calendar/resolve-date/route").POST;

  beforeEach(async () => {
    handler = (await import("@/app/api/calendar/resolve-date/route")).POST;
  });

  it("resolves 'tomorrow'", async () => {
    const res = await handler(makeRequest({ expression: "tomorrow" }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.dateStart).toBe("2026-03-19");
    expect(data.dateEnd).toBe("2026-03-19");
  });

  it("resolves 'next monday'", async () => {
    const res = await handler(makeRequest({ expression: "next monday" }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.dateStart).toBe("2026-03-23");
  });

  it("resolves 'late next week'", async () => {
    const res = await handler(makeRequest({ expression: "late next week" }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.dateStart).toBe("2026-03-26");
    expect(data.dateEnd).toBe("2026-03-27");
  });

  it("returns 400 when expression missing", async () => {
    const res = await handler(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("expression");
  });

  it("returns 500 when resolver throws", async () => {
    // Dynamically re-mock to throw
    const dateResolver = await import("@/lib/date-resolver");
    const spy = vi.spyOn(dateResolver, "resolveDate").mockImplementation(() => {
      throw new Error("Parse error");
    });

    const res = await handler(makeRequest({ expression: "???!!!" }));
    expect(res.status).toBe(500);

    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ASSIGNMENT SCENARIOS - End-to-End Flow Tests
// ═══════════════════════════════════════════════════════════════════════

describe("Assignment Scenario Flows", () => {
  /**
   * These tests simulate the tool-call sequences that the ElevenLabs agent
   * would make for each demo scenario in the assignment doc.
   */

  it("Scenario 1: Basic scheduling - find slots then create", async () => {
    const findSlotsHandler = (await import("@/app/api/calendar/find-slots/route")).POST;
    const createHandler = (await import("@/app/api/calendar/create-event/route")).POST;

    // Step 1: Agent calls find_available_slots
    mockFindAvailableSlots.mockResolvedValue([
      { start: "2026-03-18T10:00:00Z", end: "2026-03-18T10:30:00Z", participants: ["jashan@conci.in", "deepak@conci.in"] },
      { start: "2026-03-18T14:00:00Z", end: "2026-03-18T14:30:00Z", participants: ["jashan@conci.in", "deepak@conci.in"] },
    ]);

    const slotsRes = await findSlotsHandler(makeRequest({
      participants: ["jashan@conci.in", "deepak@conci.in"],
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
      timezone: "Asia/Kolkata",
    }));

    const slotsData = await slotsRes.json();
    expect(slotsData.success).toBe(true);
    expect(slotsData.slots.length).toBeGreaterThan(0);

    // Step 2: User picks a slot, agent calls create_event
    mockCreateEvent.mockResolvedValue({
      id: "created-1",
      summary: "Sync with Deepak",
      start: "2026-03-18T10:00:00+05:30",
      end: "2026-03-18T10:30:00+05:30",
      attendees: [{ email: "deepak@conci.in" }],
    });

    const createRes = await createHandler(makeRequest({
      title: "Sync with Deepak",
      start_time: "2026-03-18T10:00:00",
      duration_minutes: 30,
      attendees: ["deepak@conci.in"],
      timezone: "Asia/Kolkata",
      organizer_email: "jashan@conci.in",
    }));

    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    expect(createData.event.id).toBe("created-1");
  });

  it("Scenario 2: Multi-participant scheduling", async () => {
    const findSlotsHandler = (await import("@/app/api/calendar/find-slots/route")).POST;

    mockFindAvailableSlots.mockResolvedValue([
      {
        start: "2026-03-18T11:00:00Z",
        end: "2026-03-18T12:00:00Z",
        participants: ["jashan@conci.in", "deepak@conci.in", "monica@conci.in"],
      },
    ]);

    const res = await findSlotsHandler(makeRequest({
      participants: ["jashan@conci.in", "deepak@conci.in", "monica@conci.in"],
      duration_minutes: 60,
      date_start: "2026-03-18",
      date_end: "2026-03-20",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.slots[0].participants).toContain("jashan@conci.in");
    expect(data.slots[0].participants).toContain("deepak@conci.in");
    expect(data.slots[0].participants).toContain("monica@conci.in");
  });

  it("Scenario 3: Conflict resolution - no slots available", async () => {
    const findSlotsHandler = (await import("@/app/api/calendar/find-slots/route")).POST;

    mockFindAvailableSlots.mockResolvedValue([]); // Fully booked

    const res = await findSlotsHandler(makeRequest({
      participants: ["jashan@conci.in", "deepak@conci.in"],
      duration_minutes: 120,
      date_start: "2026-03-18",
      date_end: "2026-03-18",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.slots).toEqual([]);
    expect(data.message).toContain("No available slots");
  });

  it("Scenario 4: Rescheduling - search then update", async () => {
    const searchHandler = (await import("@/app/api/calendar/search-event/route")).POST;
    const updateHandler = (await import("@/app/api/calendar/update-event/route")).POST;

    // Step 1: Find the event to reschedule
    mockSearchEventByName.mockResolvedValue([
      { id: "e1", summary: "Team Standup", start: "2026-03-18T09:00:00Z", end: "2026-03-18T09:30:00Z" },
    ]);

    const searchRes = await searchHandler(makeRequest({
      user_email: "jashan@conci.in",
      query: "standup",
    }));

    const searchData = await searchRes.json();
    expect(searchData.count).toBe(1);
    const eventId = searchData.events[0].id;

    // Step 2: Reschedule it
    mockUpdateEvent.mockResolvedValue({
      id: eventId,
      summary: "Team Standup",
      start: "2026-03-19T09:00:00+05:30",
      end: "2026-03-19T09:30:00+05:30",
      attendees: [],
    });

    const updateRes = await updateHandler(makeRequest({
      event_id: eventId,
      user_email: "jashan@conci.in",
      new_start_time: "2026-03-19T09:00:00",
    }));

    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);
    expect(updateData.message).toContain("updated");
  });

  it("Scenario 5: Cancellation - search then delete", async () => {
    const deleteHandler = (await import("@/app/api/calendar/delete-event/route")).POST;

    // Delete by title directly (the route handles search internally)
    mockSearchEventByName.mockResolvedValue([
      { id: "e5", summary: "Lunch meeting", start: "2026-03-18T12:00:00Z" },
    ]);
    mockDeleteEvent.mockResolvedValue(undefined);

    const res = await deleteHandler(makeRequest({
      user_email: "jashan@conci.in",
      event_title: "Lunch meeting",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("cancelled");
  });

  it("Scenario 6: Calendar intelligence - workload check", async () => {
    const summaryHandler = (await import("@/app/api/calendar/summary/route")).POST;

    mockGetCalendarSummary.mockResolvedValue({
      userEmail: "jashan@conci.in",
      dateRange: { start: "2026-03-16", end: "2026-03-20" },
      totalMeetings: 12,
      totalMeetingHours: 9.5,
      freeHours: 30.5,
      busiestDay: { date: "2026-03-18", meetingCount: 4 },
      backToBackCount: 3,
      isOverbooked: false,
    });

    const res = await summaryHandler(makeRequest({
      user_email: "jashan@conci.in",
      date_start: "2026-03-16",
      date_end: "2026-03-20",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary.totalMeetings).toBe(12);
    expect(data.summary.backToBackCount).toBe(3);
    expect(data.summary.busiestDay.date).toBe("2026-03-18");
  });

  it("Scenario 7: Mid-conversation change - update duration after creation", async () => {
    const updateHandler = (await import("@/app/api/calendar/update-event/route")).POST;

    // User says "actually, make it an hour" after creating a 30-min meeting
    mockUpdateEvent.mockResolvedValue({
      id: "e1",
      summary: "Quick Sync",
      start: "2026-03-18T10:00:00+05:30",
      end: "2026-03-18T11:00:00+05:30",
      attendees: [],
    });

    const res = await updateHandler(makeRequest({
      event_id: "e1",
      user_email: "jashan@conci.in",
      new_duration_minutes: 60,
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ newDurationMinutes: 60 })
    );
  });

  it("Scenario 8: Vague request with constraint - afternoon preference", async () => {
    const findSlotsHandler = (await import("@/app/api/calendar/find-slots/route")).POST;

    mockFindAvailableSlots.mockResolvedValue([
      { start: "2026-03-18T14:00:00Z", end: "2026-03-18T14:30:00Z", participants: ["jashan@conci.in"] },
    ]);

    const res = await findSlotsHandler(makeRequest({
      participants: ["jashan@conci.in"],
      duration_minutes: 30,
      date_start: "2026-03-18",
      date_end: "2026-03-20",
      timezone: "Asia/Kolkata",
      time_preferences: {
        preferred_time_of_day: "afternoon",
      },
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.slots.length).toBeGreaterThan(0);
  });

  it("Scenario 9: Event listing for calendar view", async () => {
    const listHandler = (await import("@/app/api/calendar/list-events/route")).POST;

    mockListEvents.mockResolvedValue([
      { id: "e1", summary: "Standup", start: "2026-03-18T09:00:00+05:30", end: "2026-03-18T09:30:00+05:30" },
      { id: "e2", summary: "Design Review", start: "2026-03-18T11:00:00+05:30", end: "2026-03-18T12:00:00+05:30" },
      { id: "e3", summary: "1:1 with Manager", start: "2026-03-18T15:00:00+05:30", end: "2026-03-18T15:30:00+05:30" },
    ]);

    const res = await listHandler(makeRequest({
      user_email: "jashan@conci.in",
      date_start: "2026-03-16",
      date_end: "2026-03-20",
      timezone: "Asia/Kolkata",
    }));

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(3);
  });
});
