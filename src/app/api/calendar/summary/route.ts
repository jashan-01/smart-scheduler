import { NextRequest, NextResponse } from "next/server";
import { getCalendarSummary } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_email, date_start, date_end, timezone } = body;

    console.log("[summary] user=%s start=%s end=%s", user_email, date_start, date_end);

    if (!user_email || !date_start || !date_end) {
      return NextResponse.json(
        { error: "Missing required fields: user_email, date_start, date_end" },
        { status: 400 }
      );
    }

    const summary = await getCalendarSummary(
      user_email,
      date_start,
      date_end,
      timezone || "UTC"
    );

    console.log("[summary] Generated summary for user=%s", user_email);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: unknown) {
    console.error("[summary] Failed:", error);
    return NextResponse.json(
      { error: "Failed to get calendar summary" },
      { status: 500 }
    );
  }
}
