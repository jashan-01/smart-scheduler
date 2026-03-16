import { NextRequest, NextResponse } from "next/server";
import { createEvent } from "@/lib/google-calendar";
import { sseBroadcaster } from "@/lib/sse";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      start_time,
      duration_minutes,
      attendees,
      timezone,
      description,
      organizer_email,
    } = body;

    console.log("[create-event] title=%s start=%s duration=%s organizer=%s", title, start_time, duration_minutes, organizer_email);

    if (!title || !start_time || !duration_minutes || !organizer_email) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: title, start_time, duration_minutes, organizer_email",
        },
        { status: 400 }
      );
    }

    const event = await createEvent({
      title,
      startTime: start_time,
      durationMinutes: duration_minutes,
      attendees: attendees || [],
      timezone: timezone || "UTC",
      description,
      organizerEmail: organizer_email,
    });

    console.log("[create-event] Created: id=%s start=%s end=%s", event.id, event.start, event.end);

    sseBroadcaster.broadcast({ type: "event_created", event });

    return NextResponse.json({
      success: true,
      event,
      message: `Meeting "${title}" has been scheduled successfully.`,
    });
  } catch (error: unknown) {
    console.error("[create-event] Failed:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}
