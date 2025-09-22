import { storage } from "../storage.js";
import { getValidAccessToken as getValidAccessTokenInternal } from "../src/token-refresh.js";

/**
 * Resolves the most recent active X account and valid access token
 * Note: Currently demo-only - picks global most recent account
 * TODO: Scope by authenticated user when auth is implemented
 */
export async function resolveAccountAndToken() {
  const allAccounts = await storage.getSocialAccounts();
  const xAccounts = allAccounts.filter((acc: any) => 
    (acc.platform === "x" || acc.platform === "twitter") && 
    acc.isActive && 
    (acc.accessToken || acc.refreshToken)
  );
  
  if (xAccounts.length === 0) {
    return null;
  }

  // Use the most recently connected X account
  const account = xAccounts.sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  // Get valid token with automatic refresh
  const tokenResult = await getValidAccessTokenInternal(account.userId, "x");

  return {
    userId: account.userId,
    accountId: account.accountId, // X user ID from OAuth
    accessToken: tokenResult.accessToken
  };
}

/**
 * Legacy function - use resolveAccountAndToken() instead
 * @deprecated
 */
export async function resolveActiveXAccount() {
  const result = await resolveAccountAndToken();
  return result ? {
    userId: result.userId,
    accountId: result.accountId
  } : null;
}

/**
 * Legacy function - use resolveAccountAndToken() instead
 * @deprecated
 */
export async function getXAccessToken(): Promise<string> {
  const result = await resolveAccountAndToken();
  if (!result) {
    throw new Error("No connected X account found");
  }
  return result.accessToken;
}

/**
 * Validates and clamps tweet count parameter
 */
export function validateTweetCount(count: string | undefined): number {
  const parsed = parseInt(count || "5");
  if (isNaN(parsed)) {
    return 5; // Default if invalid
  }
  return Math.max(1, Math.min(parsed, 100)); // Clamp between 1-100
}

/**
 * Fetches user's tweets from X API
 */
export async function fetchUserTweets(
  accessToken: string, 
  xUserId: string, 
  options: {
    max_results?: number;
    pagination_token?: string;
    tweet_fields?: string;
  } = {}
) {
  const {
    max_results = 5,
    pagination_token,
    tweet_fields = "created_at,public_metrics"
  } = options;

  const url = new URL(`https://api.x.com/2/users/${xUserId}/tweets`);
  url.searchParams.set("max_results", String(max_results));
  url.searchParams.set("tweet.fields", tweet_fields);
  
  if (pagination_token) {
    url.searchParams.set("pagination_token", pagination_token);
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await response.json().catch(() => ({}));
  
  return {
    response,
    data
  };
}