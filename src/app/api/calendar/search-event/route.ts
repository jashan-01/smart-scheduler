import { NextRequest, NextResponse } from "next/server";
import { searchEventByName } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_email, query, date_start, date_end } = body;

    console.log("[search-event] user=%s query=%s start=%s end=%s", user_email, query, date_start, date_end);

    if (!user_email || !query) {
      return NextResponse.json(
        { error: "Missing required fields: user_email, query" },
        { status: 400 }
      );
    }

    const events = await searchEventByName(
      user_email,
      query,
      date_start,
      date_end
    );

    console.log("[search-event] Found %s events for query=%s", events.length, query);

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error: unknown) {
    console.error("[search-event] Failed:", error);
    return NextResponse.json(
      { error: "Failed to search events" },
      { status: 500 }
    );
  }
}
