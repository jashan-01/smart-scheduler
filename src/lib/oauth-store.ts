import { OAuth2Client } from "google-auth-library";
import { db } from "./firestore";

const COLLECTION = "oauth_tokens";

interface StoredTokens {
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  updatedAt: number;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/auth/google/callback`;
}

function createOAuth2Client(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    getRedirectUri()
  );
}

export async function storeTokens(
  email: string,
  name: string,
  picture: string | undefined,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  const data: StoredTokens = {
    email,
    name,
    picture: picture || undefined,
    accessToken,
    refreshToken,
    expiresAt,
    updatedAt: Date.now(),
  };
  await db.collection(COLLECTION).doc(email).set(data);
}

export async function getOAuthClient(
  email: string
): Promise<OAuth2Client | null> {
  const doc = await db.collection(COLLECTION).doc(email).get();
  if (!doc.exists) return null;

  const data = doc.data() as StoredTokens;
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    expiry_date: data.expiresAt,
  });

  // Persist refreshed tokens automatically
  client.on("tokens", async (tokens) => {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (tokens.access_token) updates.accessToken = tokens.access_token;
    if (tokens.expiry_date) updates.expiresAt = tokens.expiry_date;
    if (tokens.refresh_token) updates.refreshToken = tokens.refresh_token;
    await db.collection(COLLECTION).doc(email).update(updates);
  });

  return client;
}

export async function getUserInfo(
  email: string
): Promise<{ email: string; name: string; picture?: string } | null> {
  const doc = await db.collection(COLLECTION).doc(email).get();
  if (!doc.exists) return null;
  const data = doc.data() as StoredTokens;
  return { email: data.email, name: data.name, picture: data.picture };
}

export async function removeTokens(email: string): Promise<void> {
  await db.collection(COLLECTION).doc(email).delete();
}
