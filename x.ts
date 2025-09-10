import crypto from "crypto";
import { getDb } from "./db";

const {
  X_CLIENT_ID,
  X_CLIENT_SECRET,
  X_REDIRECT_URI,
  X_SCOPES,
  JWT_SECRET
} = process.env;

if (!X_CLIENT_ID || !X_REDIRECT_URI || !X_SCOPES || !JWT_SECRET) {
  throw new Error("Missing required environment variables: X_CLIENT_ID, X_REDIRECT_URI, X_SCOPES, JWT_SECRET");
}

const HOST = "https://api.x.com";
export const AUTH_URL = "https://twitter.com/i/oauth2/authorize";
export const TOKEN_URL = `${HOST}/2/oauth2/token`;
export const ME_URL = `${HOST}/2/users/me`;
export const TWEETS_URL = `${HOST}/2/tweets`;

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function makeCodeVerifier() {
  return b64url(crypto.randomBytes(64));
}

export function makeCodeChallenge(verifier: string) {
  return b64url(crypto.createHash("sha256").update(verifier).digest());
}

export function signState(raw: string) {
  const sig = crypto.createHmac("sha256", JWT_SECRET!).update(raw).digest("hex");
  return `${raw}.${sig}`;
}

export function verifyState(signed: string) {
  const [raw, sig] = signed.split(".");
  if (!raw || !sig) return null;
  const want = crypto.createHmac("sha256", JWT_SECRET!).update(raw).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? raw : null;
}

export async function upsertAccountAndToken(
  me: any,
  access_token: string,
  refresh_token: string | undefined,
  expires_in: number | undefined
) {
  const db = await getDb();
  const x_user_id = me?.data?.id;
  const username = me?.data?.username ?? null;
  const name = me?.data?.name ?? null;
  const expires_at = Math.floor(Date.now() / 1000) + (expires_in ?? 3600);

  await db.run(
    'INSERT INTO accounts (x_user_id, username, name) VALUES (?, ?, ?) ON CONFLICT(x_user_id) DO UPDATE SET username=excluded.username, name=excluded.name',
    x_user_id,
    username,
    name
  );

  await db.run(
    'INSERT INTO tokens (x_user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
    x_user_id,
    access_token,
    refresh_token ?? null,
    expires_at
  );

  return x_user_id as string;
}

export async function latestTokenRow(x_user_id?: string) {
  const db = await getDb();
  if (x_user_id) {
    return db.get('SELECT * FROM tokens WHERE x_user_id=? ORDER BY id DESC LIMIT 1', x_user_id);
  }
  return db.get('SELECT * FROM tokens ORDER BY id DESC LIMIT 1');
}

export async function ensureFreshAccessToken(row?: any): Promise<string | null> {
  if (!row) return null;
  const skew = 60;
  const now = Math.floor(Date.now() / 1000) + skew;
  if (row.expires_at > now) return row.access_token;

  if (!row.refresh_token) return row.access_token;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    client_id: X_CLIENT_ID!
  });

  // Uncomment the next line if your app requires client_secret for refresh:
  // params.set("client_secret", X_CLIENT_SECRET!);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const tok = await res.json();
  if (!res.ok) {
    console.error("Refresh failed:", tok);
    return row.access_token;
  }
  const expires_at = Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600);
  const db = await getDb();
  await db.run(
    'INSERT INTO tokens (x_user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
    row.x_user_id,
    tok.access_token,
    tok.refresh_token ?? row.refresh_token,
    expires_at
  );
  return tok.access_token as string;
}

export async function getMe(access_token: string) {
  const r = await fetch(`${ME_URL}?user.fields=username,name`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  return r.json();
}

export async function postTweet(access_token: string, text: string) {
  const r = await fetch(TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });
  const body = await r.json();
  return { ok: r.ok, status: r.status, body };
}

export async function lookupTweets(access_token: string, idsCsv: string) {
  const url = new URL(TWEETS_URL);
  url.searchParams.set("ids", idsCsv);
  url.searchParams.set("tweet.fields", "public_metrics");
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const body = await r.json();
  return { ok: r.ok, status: r.status, body };
}
