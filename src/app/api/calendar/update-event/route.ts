import { NextRequest, NextResponse } from "next/server";
import { updateEvent } from "@/lib/google-calendar";
import { sseBroadcaster } from "@/lib/sse";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      event_id,
      user_email,
      new_start_time,
      new_duration_minutes,
      new_title,
    } = body;

    console.log("[update-event] event_id=%s user=%s new_start=%s new_title=%s", event_id, user_email, new_start_time, new_title);

    if (!event_id || !user_email) {
      return NextResponse.json(
        { error: "Missing required fields: event_id, user_email" },
        { status: 400 }
      );
    }

    if (!new_start_time && !new_duration_minutes && !new_title) {
      return NextResponse.json(
        {
          error:
            "At least one update field is required: new_start_time, new_duration_minutes, or new_title",
        },
        { status: 400 }
      );
    }

    const event = await updateEvent({
      eventId: event_id,
      userEmail: user_email,
      newStartTime: new_start_time,
      newDurationMinutes: new_duration_minutes,
      newTitle: new_title,
    });

    console.log("[update-event] Updated: id=%s summary=%s", event.id, event.summary);

    sseBroadcaster.broadcast({ type: "event_updated", event });

    return NextResponse.json({
      success: true,
      event,
      message: `Meeting "${event.summary}" has been updated successfully.`,
    });
  } catch (error: unknown) {
    console.error("[update-event] Failed:", error);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}
