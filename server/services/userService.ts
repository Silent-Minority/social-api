import { storage } from "../storage.js";
import { getValidAccessToken } from "../src/token-refresh.js";

/**
 * CANONICAL interface: Resolves account and token with consistent format
 * Returns: {userId, accountId, accessToken} for compatibility with all callers
 */
export async function resolveAccountAndToken(userIdOrDefault = "default") {
  // Get all accounts and find the most recent active X account (demo pattern)
  const allAccounts = await storage.getSocialAccounts();
  const xAccounts = allAccounts.filter((acc: any) => 
    (acc.platform === "x" || acc.platform === "twitter") && 
    acc.isActive && 
    (acc.accessToken || acc.refreshToken)
  );
  
  if (xAccounts.length === 0) {
    throw new Error("No connected X account found");
  }

  // Use the most recently connected X account
  const account = xAccounts.sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const access = await getValidAccessToken(account.userId, "x");
  
  // Return canonical format: {userId, accountId, accessToken}
  return {
    userId: account.userId,
    accountId: account.accountId, // X user ID from OAuth
    accessToken: access.accessToken
  };
}

/**
 * Legacy wrapper for backward compatibility
 * @deprecated Use resolveAccountAndToken() instead
 */
export async function resolveAccountAndTokenLegacy(userId = "default") {
  const result = await resolveAccountAndToken(userId);
  
  // Convert canonical format back to legacy format for compatibility
  const account = await storage.getSocialAccounts().then(accounts => 
    accounts.find(acc => acc.userId === result.userId && 
                        (acc.platform === "x" || acc.platform === "twitter") && 
                        acc.isActive)
  );
  
  return { 
    account, 
    access: result.accessToken 
  };
}