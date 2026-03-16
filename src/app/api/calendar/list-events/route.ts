import { NextRequest, NextResponse } from "next/server";
import { listEvents } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_email, date_start, date_end, timezone } = body;

    console.log("[list-events] user=%s start=%s end=%s", user_email, date_start, date_end);

    if (!user_email || !date_start || !date_end) {
      return NextResponse.json(
        { error: "Missing required fields: user_email, date_start, date_end" },
        { status: 400 }
      );
    }

    const events = await listEvents(
      user_email,
      date_start,
      date_end,
      timezone || "UTC"
    );

    console.log("[list-events] Found %s events", events.length);

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error: unknown) {
    console.error("[list-events] Failed:", error);
    return NextResponse.json(
      { error: "Failed to list events" },
      { status: 500 }
    );
  }
}
