import { storage } from "../storage.js";
import { getValidAccessToken as getValidAccessTokenInternal } from "../src/token-refresh.js";

/**
 * Resolves the most recent active X account
 * Note: Currently demo-only - picks global most recent account
 * TODO: Scope by authenticated user when auth is implemented
 */
export async function resolveActiveXAccount() {
  const allAccounts = await storage.getSocialAccounts();
  const xAccounts = allAccounts.filter((acc: any) => 
    acc.platform === "x" && 
    acc.isActive && 
    acc.accessToken
  );
  
  if (xAccounts.length === 0) {
    return null;
  }

  // Use the most recently connected X account
  const account = xAccounts.sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  return {
    userId: account.userId,
    accountId: account.accountId, // X user ID from OAuth
    accessToken: account.accessToken
  };
}

/**
 * Gets a valid X access token, refreshing if necessary
 */
export async function getXAccessToken(): Promise<string> {
  // Find the most recent active X account (same logic as resolveActiveXAccount)
  const account = await resolveActiveXAccount();
  if (!account) {
    throw new Error("No connected X account found");
  }

  // Get valid token with automatic refresh
  const tokenResult = await getValidAccessTokenInternal(account.userId, "x");
  return tokenResult.accessToken;
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
  url.searchParams.set("max_results", String(Math.min(max_results, 100)));
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