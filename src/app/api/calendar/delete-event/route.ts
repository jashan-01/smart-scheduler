import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, searchEventByName } from "@/lib/google-calendar";
import { sseBroadcaster } from "@/lib/sse";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event_id, user_email, event_title, date_start, date_end } = body;

    console.log("[delete-event] event_id=%s title=%s user=%s", event_id, event_title, user_email);

    if (!user_email) {
      return NextResponse.json(
        { error: "Missing required field: user_email" },
        { status: 400 }
      );
    }

    let targetEventId = event_id;

    // If no event_id but event_title is provided, search for the event
    if (!targetEventId && event_title) {
      const events = await searchEventByName(
        user_email,
        event_title,
        date_start,
        date_end
      );

      if (events.length === 0) {
        return NextResponse.json({
          success: false,
          message: `No event found matching "${event_title}".`,
        });
      }

      if (events.length > 1) {
        return NextResponse.json({
          success: false,
          message: `Found ${events.length} events matching "${event_title}". Please be more specific.`,
          events: events.map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start,
          })),
        });
      }

      targetEventId = events[0].id;
    }

    if (!targetEventId) {
      return NextResponse.json(
        { error: "Either event_id or event_title is required" },
        { status: 400 }
      );
    }

    await deleteEvent(targetEventId, user_email);

    console.log("[delete-event] Deleted: id=%s", targetEventId);

    sseBroadcaster.broadcast({ type: "event_deleted", eventId: targetEventId });

    return NextResponse.json({
      success: true,
      message: "Meeting has been cancelled successfully.",
    });
  } catch (error: unknown) {
    console.error("[delete-event] Failed:", error);
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}
