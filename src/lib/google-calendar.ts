import { google, calendar_v3 } from "googleapis";
import { JWT } from "google-auth-library";
import { getOAuthClient } from "./oauth-store";
import type {
  CalendarEvent,
  FreeBusyResult,
  CreateEventRequest,
  UpdateEventRequest,
  CalendarSummary,
  BusySlot,
} from "./types";
import {
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  parseISO,
  differenceInMinutes,
  format,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

/**
 * Parse a date string into a start-of-day ISO timestamp.
 * Handles both "YYYY-MM-DD" and full ISO strings.
 */
function toTimeMin(date: string): string {
  if (date.includes("T")) return new Date(date).toISOString();
  return new Date(date + "T00:00:00").toISOString();
}

/**
 * Parse a date string into an end-of-day ISO timestamp.
 * When given "YYYY-MM-DD", returns 23:59:59 of that day.
 */
function toTimeMax(date: string): string {
  if (date.includes("T")) return new Date(date).toISOString();
  return new Date(date + "T23:59:59").toISOString();
}

function getAuthClient(subjectEmail: string): JWT {
  const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}"
  );

  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
    subject: subjectEmail,
  });
}

async function getCalendar(subjectEmail: string): Promise<calendar_v3.Calendar> {
  // Check if this user signed in via OAuth (personal mode)
  const oauthClient = await getOAuthClient(subjectEmail);
  if (oauthClient) {
    return google.calendar({ version: "v3", auth: oauthClient });
  }
  // Fall back to service account with domain-wide delegation (org mode)
  const auth = getAuthClient(subjectEmail);
  return google.calendar({ version: "v3", auth });
}

// ─── List Events ────────────────────────────────────────────────────────────

export async function listEvents(
  userEmail: string,
  dateStart: string,
  dateEnd: string,
  timezone: string = "UTC"
): Promise<CalendarEvent[]> {
  const calendar = await getCalendar(userEmail);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: toTimeMin(dateStart),
    timeMax: toTimeMax(dateEnd),
    singleEvents: true,
    orderBy: "startTime",
    timeZone: timezone,
  });

  return (response.data.items || []).map((event) => ({
    id: event.id || "",
    summary: event.summary || "(No title)",
    description: event.description || undefined,
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    attendees: (event.attendees || []).map((a) => ({
      email: a.email || "",
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus as
        | "accepted"
        | "declined"
        | "tentative"
        | "needsAction"
        | undefined,
    })),
    location: event.location || undefined,
    timezone,
  }));
}

// ─── Search Event by Name ───────────────────────────────────────────────────

export async function searchEventByName(
  userEmail: string,
  query: string,
  dateStart?: string,
  dateEnd?: string,
  timezone: string = "UTC"
): Promise<CalendarEvent[]> {
  const calendar = await getCalendar(userEmail);

  const params: calendar_v3.Params$Resource$Events$List = {
    calendarId: "primary",
    q: query,
    singleEvents: true,
    orderBy: "startTime",
  };

  if (dateStart) params.timeMin = toTimeMin(dateStart);
  if (dateEnd) params.timeMax = toTimeMax(dateEnd);

  const response = await calendar.events.list(params);

  return (response.data.items || []).map((event) => ({
    id: event.id || "",
    summary: event.summary || "(No title)",
    description: event.description || undefined,
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    attendees: (event.attendees || []).map((a) => ({
      email: a.email || "",
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus as
        | "accepted"
        | "declined"
        | "tentative"
        | "needsAction"
        | undefined,
    })),
    location: event.location || undefined,
    timezone,
  }));
}

// ─── Check Availability (FreeBusy) ─────────────────────────────────────────

export async function checkAvailability(
  participants: string[],
  dateStart: string,
  dateEnd: string,
  timezone: string = "UTC"
): Promise<FreeBusyResult[]> {
  // Use the first participant to authenticate (domain-wide delegation)
  const calendar = await getCalendar(participants[0]);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: toTimeMin(dateStart),
      timeMax: toTimeMax(dateEnd),
      timeZone: timezone,
      items: participants.map((email) => ({ id: email })),
    },
  });

  const calendars = response.data.calendars || {};

  return participants.map((email) => ({
    calendar: email,
    busy: (calendars[email]?.busy || []).map((slot) => ({
      start: slot.start || "",
      end: slot.end || "",
    })),
  }));
}

// ─── Find Available Slots ───────────────────────────────────────────────────

const STEP_MS = 15 * 60 * 1000; // 15-minute candidate interval
const MS_PER_MIN = 60 * 1000;

// Ideal meeting start hours for scoring (10 AM and 2 PM are peak productivity)
const IDEAL_HOURS = [10, 14];

interface SlotCandidate {
  startMs: number;
  endMs: number;
  score: number;
}

export async function findAvailableSlots(
  participants: string[],
  durationMinutes: number,
  dateStart: string,
  dateEnd: string,
  timezone: string = "UTC",
  timePreferences?: {
    preferredTimeOfDay?: "morning" | "afternoon" | "evening";
    earliestHour?: number;
    latestHour?: number;
    excludeDays?: number[];
    bufferMinutes?: number;
  },
  maxResults: number = 5
): Promise<{ start: string; end: string; participants: string[] }[]> {
  const durationMs = durationMinutes * MS_PER_MIN;
  const bufferMs = (timePreferences?.bufferMinutes ?? 0) * MS_PER_MIN;
  const excludeDays = timePreferences?.excludeDays ?? [0, 6];
  const earliestHour = timePreferences?.earliestHour ?? defaultEarliestHour(timePreferences?.preferredTimeOfDay);
  const latestHour = timePreferences?.latestHour ?? defaultLatestHour(timePreferences?.preferredTimeOfDay);

  // ── 1. Fetch busy intervals for all participants ──
  const freeBusyResults = await checkAvailability(participants, dateStart, dateEnd, timezone);

  // ── 2. Flatten all busy intervals into epoch-ms pairs, sort, merge ──
  const rawIntervals: [number, number][] = [];
  for (const result of freeBusyResults) {
    for (const slot of result.busy) {
      const s = new Date(slot.start).getTime();
      const e = new Date(slot.end).getTime() + bufferMs;
      rawIntervals.push([s, e]);
    }
  }
  const busyTimeline = mergeIntervals(rawIntervals);

  // ── 3. Iterate over each eligible day ──
  // Parse date range as local dates in the user's timezone so we get
  // the correct calendar days regardless of the server's timezone (UTC on Cloud Run).
  const rangeStart = dateStart.includes("T") ? parseISO(dateStart) : new Date(dateStart + "T00:00:00");
  const rangeEnd = dateEnd.includes("T") ? parseISO(dateEnd) : new Date(dateEnd + "T23:59:59");
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const candidates: SlotCandidate[] = [];

  for (const day of days) {
    // Use the user's timezone to determine the day-of-week for exclusion
    // and to construct the working window boundaries.
    const year = day.getFullYear();
    const month = day.getMonth();
    const date = day.getDate();

    // Construct "earliestHour on this calendar day in the user's timezone"
    // fromZonedTime converts a local time in `timezone` → UTC epoch.
    const winStartMs = fromZonedTime(new Date(year, month, date, earliestHour, 0, 0), timezone).getTime();
    const winEndMs = fromZonedTime(new Date(year, month, date, latestHour, 0, 0), timezone).getTime();

    // Check day-of-week in the user's timezone
    const zonedDay = toZonedTime(new Date(winStartMs), timezone);
    if (excludeDays.includes(zonedDay.getDay())) continue;

    if (winEndMs <= winStartMs) continue;

    // ── 4. Compute free gaps by subtracting busy intervals from the window ──
    const freeGaps = subtractIntervals(winStartMs, winEndMs, busyTimeline);

    // ── 5. Slide a candidate window across each gap at 15-min steps ──
    for (const [gapStart, gapEnd] of freeGaps) {
      let cursor = gapStart;
      while (cursor + durationMs <= gapEnd) {
        candidates.push({
          startMs: cursor,
          endMs: cursor + durationMs,
          score: scoreSlot(cursor, timezone, timePreferences?.preferredTimeOfDay),
        });
        cursor += STEP_MS;
      }
    }
  }

  // ── 6. Sort by score (lower = better), then chronologically as tiebreaker ──
  candidates.sort((a, b) => a.score - b.score || a.startMs - b.startMs);

  // ── 7. Deduplicate overlapping winners: don't return slots that overlap each other ──
  const selected: SlotCandidate[] = [];
  for (const c of candidates) {
    if (selected.length >= maxResults) break;
    const overlaps = selected.some((s) => c.startMs < s.endMs && c.endMs > s.startMs);
    if (!overlaps) selected.push(c);
  }

  // Sort final selection chronologically for clean presentation
  selected.sort((a, b) => a.startMs - b.startMs);

  return selected.map((c) => ({
    start: formatLocalDateTime(c.startMs, timezone),
    end: formatLocalDateTime(c.endMs, timezone),
    participants,
  }));
}

/**
 * Format an epoch-ms timestamp as a bare local datetime string in the given timezone.
 * Output: "2026-03-17T13:00:00" (no Z, no offset — represents local time).
 * This matches what create-event expects: a bare datetime + separate timezone field.
 */
function formatLocalDateTime(epochMs: number, timezone: string): string {
  const zoned = toZonedTime(new Date(epochMs), timezone);
  const y = zoned.getFullYear();
  const mo = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  const h = String(zoned.getHours()).padStart(2, "0");
  const mi = String(zoned.getMinutes()).padStart(2, "0");
  const s = String(zoned.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

/**
 * Add minutes to a bare local datetime string (e.g. "2026-03-18T10:30:00").
 * Uses pure arithmetic on the date components — never passes through new Date()
 * — so the result is independent of the server's timezone.
 */
function addMinutesToLocalDateTime(localDT: string, minutes: number): string {
  const [datePart, timePart] = localDT.split("T");
  const [yearStr, moStr, dayStr] = datePart.split("-");
  const [hStr, mStr, sStr] = timePart.split(":");

  let year = parseInt(yearStr, 10);
  let month = parseInt(moStr, 10) - 1; // 0-indexed
  let day = parseInt(dayStr, 10);
  let hour = parseInt(hStr, 10);
  let min = parseInt(mStr, 10);
  const sec = sStr || "00";

  min += minutes;
  hour += Math.floor(min / 60);
  min = min % 60;
  if (min < 0) { min += 60; hour--; }

  // Roll over hours into days using a simple Date for calendar math
  // (month lengths, leap years). We only use Date for the date portion,
  // constructing it with UTC methods to avoid any local-TZ influence.
  const extraDays = Math.floor(hour / 24);
  hour = hour % 24;
  if (hour < 0) { hour += 24; }

  if (extraDays !== 0) {
    const d = new Date(Date.UTC(year, month, day + extraDays));
    year = d.getUTCFullYear();
    month = d.getUTCMonth();
    day = d.getUTCDate();
  }

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:${sec}`;
}

/**
 * Merge overlapping or adjacent intervals.
 * Input: unsorted array of [start, end] pairs (epoch ms).
 * Output: sorted, non-overlapping intervals.
 */
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const [s, e] = sorted[i];
    if (s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

/**
 * Subtract busy intervals from a window [winStart, winEnd].
 * Returns the remaining free gaps as [start, end] pairs.
 * Assumes `busy` is sorted and non-overlapping (output of mergeIntervals).
 */
function subtractIntervals(
  winStart: number,
  winEnd: number,
  busy: [number, number][]
): [number, number][] {
  const gaps: [number, number][] = [];
  let cursor = winStart;

  for (const [bs, be] of busy) {
    if (be <= cursor) continue;     // busy slot entirely before cursor
    if (bs >= winEnd) break;        // busy slot entirely after window

    const effectiveStart = Math.max(bs, cursor);
    if (effectiveStart > cursor) {
      gaps.push([cursor, effectiveStart]);
    }
    cursor = Math.max(cursor, be);
  }

  if (cursor < winEnd) {
    gaps.push([cursor, winEnd]);
  }

  return gaps;
}

/**
 * Score a slot: lower is better.
 * Prefers times near ideal hours (10 AM, 2 PM) in the user's local timezone.
 * If a time-of-day preference is set, heavily penalizes slots outside that range.
 */
function scoreSlot(startMs: number, timezone: string, preferredTime?: "morning" | "afternoon" | "evening"): number {
  const d = toZonedTime(new Date(startMs), timezone);
  const hour = d.getHours() + d.getMinutes() / 60;

  // Base score: distance from nearest ideal hour
  const idealDist = Math.min(...IDEAL_HOURS.map((h) => Math.abs(hour - h)));

  // Outside core working hours (9-18): mild penalty so working-hour slots rank first,
  // but evening/early slots still appear if working hours are full.
  const outsideWorkingHours = (hour < 9 || hour >= 18) ? 10 : 0;

  // Explicit preference: if user asked for morning/afternoon/evening,
  // slots outside that range get a heavy penalty
  let prefPenalty = 0;
  if (preferredTime) {
    const [lo, hi] = preferredRange(preferredTime);
    if (hour < lo || hour >= hi) {
      prefPenalty = 100; // heavy penalty for outside preferred range
    }
  }

  return idealDist + outsideWorkingHours + prefPenalty;
}

function preferredRange(pref: "morning" | "afternoon" | "evening"): [number, number] {
  switch (pref) {
    case "morning": return [8, 12];
    case "afternoon": return [12, 17];
    case "evening": return [17, 21];
  }
}

function defaultEarliestHour(timeOfDay?: "morning" | "afternoon" | "evening"): number {
  switch (timeOfDay) {
    case "morning": return 8;
    case "afternoon": return 12;
    case "evening": return 17;
    default: return 8; // Wide window — scoring prefers working hours
  }
}

function defaultLatestHour(timeOfDay?: "morning" | "afternoon" | "evening"): number {
  switch (timeOfDay) {
    case "morning": return 12;
    case "afternoon": return 17;
    case "evening": return 21;
    default: return 21; // Wide window — scoring prefers working hours
  }
}

// ─── Create Event ───────────────────────────────────────────────────────────

export async function createEvent(
  request: CreateEventRequest
): Promise<CalendarEvent> {
  const calendar = await getCalendar(request.organizerEmail);

  // Calculate end time by adding duration.
  // For bare local datetimes (no Z/offset), use string arithmetic to avoid
  // timezone-dependent new Date() parsing that breaks when server TZ ≠ event TZ.
  const hasOffset = request.startTime.includes("+") || request.startTime.endsWith("Z");
  const endStr = hasOffset
    ? new Date(new Date(request.startTime).getTime() + request.durationMinutes * 60_000).toISOString()
    : addMinutesToLocalDateTime(request.startTime, request.durationMinutes);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: request.title,
      description: request.description,
      start: {
        dateTime: request.startTime,
        timeZone: request.timezone,
      },
      end: {
        dateTime: endStr,
        timeZone: request.timezone,
      },
      attendees: request.attendees.map((email) => ({ email })),
    },
    sendUpdates: "all",
  });

  const event = response.data;
  return {
    id: event.id || "",
    summary: event.summary || "",
    description: event.description || undefined,
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    attendees: (event.attendees || []).map((a) => ({
      email: a.email || "",
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus as
        | "accepted"
        | "declined"
        | "tentative"
        | "needsAction"
        | undefined,
    })),
    location: event.location || undefined,
    timezone: request.timezone,
  };
}

// ─── Update Event ───────────────────────────────────────────────────────────

export async function updateEvent(
  request: UpdateEventRequest
): Promise<CalendarEvent> {
  const calendar = await getCalendar(request.userEmail);

  // First fetch the existing event
  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId: request.eventId,
  });

  const patch: calendar_v3.Schema$Event = {};

  if (request.newTitle) {
    patch.summary = request.newTitle;
  }

  if (request.newStartTime) {
    const originalDuration = differenceInMinutes(
      new Date(existing.data.end?.dateTime || ""),
      new Date(existing.data.start?.dateTime || "")
    );
    const duration = request.newDurationMinutes || originalDuration;
    const hasOffset = request.newStartTime.includes("+") || request.newStartTime.endsWith("Z");
    const endStr = hasOffset
      ? new Date(new Date(request.newStartTime).getTime() + duration * 60_000).toISOString()
      : addMinutesToLocalDateTime(request.newStartTime, duration);

    patch.start = { dateTime: request.newStartTime, timeZone: existing.data.start?.timeZone || undefined };
    patch.end = { dateTime: endStr, timeZone: existing.data.end?.timeZone || undefined };
  } else if (request.newDurationMinutes) {
    const existingStart = new Date(existing.data.start?.dateTime || "");
    const newEnd = new Date(
      existingStart.getTime() + request.newDurationMinutes * 60 * 1000
    );
    patch.end = { dateTime: newEnd.toISOString() };
  }

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId: request.eventId,
    requestBody: patch,
    sendUpdates: "all",
  });

  const event = response.data;
  return {
    id: event.id || "",
    summary: event.summary || "",
    description: event.description || undefined,
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    attendees: (event.attendees || []).map((a) => ({
      email: a.email || "",
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus as
        | "accepted"
        | "declined"
        | "tentative"
        | "needsAction"
        | undefined,
    })),
    location: event.location || undefined,
    timezone: existing.data.start?.timeZone || "UTC",
  };
}

// ─── Delete Event ───────────────────────────────────────────────────────────

export async function deleteEvent(
  eventId: string,
  userEmail: string
): Promise<void> {
  const calendar = await getCalendar(userEmail);

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
  });
}

// ─── Calendar Summary ───────────────────────────────────────────────────────

export async function getCalendarSummary(
  userEmail: string,
  dateStart: string,
  dateEnd: string,
  timezone: string = "UTC"
): Promise<CalendarSummary> {
  const events = await listEvents(userEmail, dateStart, dateEnd, timezone);

  const dayMap = new Map<string, number>();
  let totalMeetingMinutes = 0;
  let backToBackCount = 0;

  // Sort events by start time
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const start = new Date(event.start);
    const end = new Date(event.end);
    const duration = differenceInMinutes(end, start);
    totalMeetingMinutes += duration;

    const dayKey = format(start, "yyyy-MM-dd");
    dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1);

    // Check back-to-back (within 5 minutes)
    if (i > 0) {
      const prevEnd = new Date(sorted[i - 1].end);
      if (differenceInMinutes(start, prevEnd) <= 5) {
        backToBackCount++;
      }
    }
  }

  // Find busiest day
  let busiestDay = { date: "", meetingCount: 0 };
  for (const [date, count] of dayMap) {
    if (count > busiestDay.meetingCount) {
      busiestDay = { date, meetingCount: count };
    }
  }

  // Calculate total working hours in range
  const days = eachDayOfInterval({
    start: startOfDay(parseISO(dateStart)),
    end: endOfDay(parseISO(dateEnd)),
  });
  const workingDays = days.filter(
    (d) => d.getDay() !== 0 && d.getDay() !== 6
  );
  const totalWorkingHours = workingDays.length * 8; // Assume 8-hour workday

  const totalMeetingHours = Math.round((totalMeetingMinutes / 60) * 10) / 10;
  const freeHours =
    Math.round((totalWorkingHours - totalMeetingHours) * 10) / 10;

  return {
    userEmail,
    dateRange: { start: dateStart, end: dateEnd },
    totalMeetings: events.length,
    totalMeetingHours,
    freeHours: Math.max(0, freeHours),
    busiestDay,
    backToBackCount,
    isOverbooked: totalMeetingHours / totalWorkingHours > 0.7,
  };
}
