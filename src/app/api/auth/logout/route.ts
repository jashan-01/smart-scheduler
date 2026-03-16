import { NextRequest, NextResponse } from "next/server";
import { removeTokens } from "@/lib/oauth-store";

export async function POST(req: NextRequest) {
  const email = req.cookies.get("session_email")?.value;

  if (email) {
    await removeTokens(email);
    console.log("[logout] Removed tokens for user=%s", email);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("session_email");
  return response;
}
