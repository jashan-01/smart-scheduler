import { NextRequest, NextResponse } from "next/server";
import { checkAvailability } from "@/lib/google-calendar";
import { sseBroadcaster } from "@/lib/sse";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { participants, date_start, date_end, timezone } = body;

    console.log("[availability] participants=%s start=%s end=%s", JSON.stringify(participants), date_start, date_end);

    if (!participants?.length || !date_start || !date_end) {
      return NextResponse.json(
        { error: "Missing required fields: participants, date_start, date_end" },
        { status: 400 }
      );
    }

    const results = await checkAvailability(
      participants,
      date_start,
      date_end,
      timezone || "UTC"
    );

    console.log("[availability] Checked %s calendars", results.length);

    sseBroadcaster.broadcast({ type: "availability_checked", results });

    return NextResponse.json({
      success: true,
      results,
      summary: results.map((r) => ({
        calendar: r.calendar,
        busySlotCount: r.busy.length,
        busySlots: r.busy.map(
          (s) =>
            `${new Date(s.start).toLocaleTimeString()} - ${new Date(s.end).toLocaleTimeString()}`
        ),
      })),
    });
  } catch (error: unknown) {
    console.error("[availability] Failed:", error);
    return NextResponse.json(
      { error: "Failed to check availability" },
      { status: 500 }
    );
  }
}
