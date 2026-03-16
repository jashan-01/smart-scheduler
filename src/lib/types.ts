export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  attendees?: Attendee[];
  location?: string;
  timezone: string;
}

export interface Attendee {
  email: string;
  displayName?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
}

export interface BusySlot {
  start: string;
  end: string;
}

export interface FreeBusyResult {
  calendar: string;
  busy: BusySlot[];
}

export interface AvailableSlot {
  start: string;
  end: string;
  participants: string[];
}

export interface TimePreference {
  preferredTimeOfDay?: "morning" | "afternoon" | "evening";
  earliestHour?: number; // 0-23
  latestHour?: number; // 0-23
  excludeDays?: number[]; // 0=Sunday, 6=Saturday
  bufferMinutes?: number; // buffer after last meeting
}

export interface FindSlotsRequest {
  participants: string[];
  durationMinutes: number;
  dateStart: string;
  dateEnd: string;
  timePreferences?: TimePreference;
  timezone: string;
  maxResults?: number;
}

export interface CreateEventRequest {
  title: string;
  startTime: string;
  durationMinutes: number;
  attendees: string[];
  timezone: string;
  description?: string;
  organizerEmail: string;
}

export interface UpdateEventRequest {
  eventId: string;
  userEmail: string;
  newStartTime?: string;
  newDurationMinutes?: number;
  newTitle?: string;
}

export interface CalendarSummary {
  userEmail: string;
  dateRange: { start: string; end: string };
  totalMeetings: number;
  totalMeetingHours: number;
  freeHours: number;
  busiestDay: { date: string; meetingCount: number };
  backToBackCount: number;
  isOverbooked: boolean;
}

// ElevenLabs webhook payload structure
export interface ElevenLabsToolCall {
  tool_call_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
}

// SSE event types for real-time calendar updates
export type CalendarSSEEvent =
  | { type: "event_created"; event: CalendarEvent }
  | { type: "event_updated"; event: CalendarEvent }
  | { type: "event_deleted"; eventId: string }
  | { type: "slots_found"; slots: AvailableSlot[] }
  | { type: "availability_checked"; results: FreeBusyResult[] };
