import { storage } from "../storage.js";
import { getValidAccessToken } from "../src/token-refresh.js";

export async function resolveAccountAndToken(userId = "default") {
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
  return { account, access: access.accessToken };
}