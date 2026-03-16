import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { storeTokens } from "@/lib/oauth-store";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    console.error("[oauth callback] User denied consent:", error);
    return NextResponse.redirect(new URL("/?error=consent_denied", baseUrl));
  }

  if (!code) {
    console.error("[oauth callback] No authorization code received");
    return NextResponse.redirect(new URL("/?error=no_code", baseUrl));
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    const client = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri
    );

    // Exchange authorization code for tokens
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      console.error("[oauth callback] No access token in response");
      return NextResponse.redirect(
        new URL("/?error=token_exchange_failed", baseUrl)
      );
    }

    if (!tokens.refresh_token) {
      console.error("[oauth callback] No refresh token in response");
      return NextResponse.redirect(
        new URL("/?error=token_exchange_failed", baseUrl)
      );
    }

    // Fetch user info (email, name, picture)
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );

    if (!userInfoRes.ok) {
      console.error("[oauth callback] Failed to fetch user info:", userInfoRes.status);
      return NextResponse.redirect(
        new URL("/?error=auth_failed", baseUrl)
      );
    }

    const userInfo = await userInfoRes.json();

    if (!userInfo.email) {
      console.error("[oauth callback] No email in user info");
      return NextResponse.redirect(new URL("/?error=no_email", baseUrl));
    }

    // Store tokens in Firestore
    await storeTokens(
      userInfo.email,
      userInfo.name || userInfo.email,
      userInfo.picture,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date || Date.now() + 3600_000
    );

    console.log("[oauth callback] Stored tokens for user=%s", userInfo.email);

    // Set session cookie (email only — tokens are in Firestore)
    const response = NextResponse.redirect(new URL("/personal", baseUrl));
    response.cookies.set("session_email", userInfo.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err) {
    console.error("[oauth callback] Error:", err);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
