import { NextRequest, NextResponse } from "next/server";
import { getUserInfo } from "@/lib/oauth-store";

export async function GET(req: NextRequest) {
  const email = req.cookies.get("session_email")?.value;

  if (!email) {
    return NextResponse.json({ authenticated: false });
  }

  const user = await getUserInfo(email);
  if (!user) {
    // Cookie exists but no tokens in Firestore — clear stale cookie
    const response = NextResponse.json({ authenticated: false });
    response.cookies.delete("session_email");
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    email: user.email,
    name: user.name,
    picture: user.picture,
  });
}
