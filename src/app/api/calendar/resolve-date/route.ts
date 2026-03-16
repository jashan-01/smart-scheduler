import { NextRequest, NextResponse } from "next/server";
import { resolveDate } from "@/lib/date-resolver";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { expression } = body;

    console.log("[resolve-date] expression=%s", expression);

    if (!expression) {
      return NextResponse.json(
        { error: "Missing required field: expression" },
        { status: 400 }
      );
    }

    const result = resolveDate(expression);

    console.log("[resolve-date] Resolved: %s -> start=%s end=%s", expression, result.dateStart, result.dateEnd);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    console.error("[resolve-date] Failed:", error);
    return NextResponse.json(
      { error: "Failed to resolve date expression" },
      { status: 500 }
    );
  }
}
