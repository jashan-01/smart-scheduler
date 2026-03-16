import { NextRequest, NextResponse } from "next/server";
import { findAvailableSlots } from "@/lib/google-calendar";
import { sseBroadcaster } from "@/lib/sse";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      participants,
      duration_minutes,
      date_start,
      date_end,
      timezone,
      time_preferences,
      max_results,
    } = body;

    console.log("[find-slots] participants=%s duration=%s start=%s end=%s tz=%s", JSON.stringify(participants), duration_minutes, date_start, date_end, timezone);

    if (!participants?.length || !duration_minutes || !date_start || !date_end) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: participants, duration_minutes, date_start, date_end",
        },
        { status: 400 }
      );
    }

    const slots = await findAvailableSlots(
      participants,
      duration_minutes,
      date_start,
      date_end,
      timezone || "UTC",
      time_preferences
        ? {
            preferredTimeOfDay: time_preferences.preferred_time_of_day,
            earliestHour: time_preferences.earliest_hour,
            latestHour: time_preferences.latest_hour,
            excludeDays: time_preferences.exclude_days,
            bufferMinutes: time_preferences.buffer_minutes,
          }
        : undefined,
      max_results || 5
    );

    console.log("[find-slots] Found %s slots: %s", slots.length, JSON.stringify(slots.map(s => ({ start: s.start, end: s.end }))));

    sseBroadcaster.broadcast({ type: "slots_found", slots });

    if (slots.length === 0) {
      return NextResponse.json({
        success: true,
        slots: [],
        message:
          "No available slots found for the given criteria. Try expanding the date range or adjusting time preferences.",
      });
    }

    return NextResponse.json({
      success: true,
      slots,
      message: `Found ${slots.length} available slot(s).`,
    });
  } catch (error: unknown) {
    console.error("[find-slots] Failed:", error);
    return NextResponse.json(
      { error: "Failed to find available slots" },
      { status: 500 }
    );
  }
}
