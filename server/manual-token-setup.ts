import { storage } from "./storage";
import { TwitterOAuth, calculateTokenExpiration } from "./oauth";

/**
 * Manual token insertion utility for troubleshooting OAuth callback issues
 * This bypasses the normal OAuth flow when callbacks aren't reaching the server
 */

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  twitter_user_id: string;
  twitter_username: string;
}

export async function insertManualTokens(tokenData: TokenData): Promise<void> {
  const userId = "7126459b-1411-4767-84ec-93625a44f067"; // Mirancourt user ID
  
  // Calculate token expiration
  const expiresAt = tokenData.expires_in 
    ? calculateTokenExpiration(tokenData.expires_in)
    : new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now as default

  // Check if social account already exists
  const existingAccount = await storage.getSocialAccountByPlatform(userId, "x");
  
  if (existingAccount) {
    // Update existing account
    await storage.updateSocialAccount(existingAccount.id, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenExpiresAt: expiresAt,
      scope: tokenData.scope || "tweet.read tweet.write users.read offline.access",
      accountUsername: tokenData.twitter_username,
      accountId: tokenData.twitter_user_id,
      isActive: true,
    });
    
    console.log(`✅ Updated existing X account for Mirancourt user (${tokenData.twitter_username})`);
  } else {
    // Create new social account
    await storage.createSocialAccount({
      userId,
      platform: "x",
      accountId: tokenData.twitter_user_id,
      accountUsername: tokenData.twitter_username,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenExpiresAt: expiresAt,
      scope: tokenData.scope || "tweet.read tweet.write users.read offline.access",
      isActive: true,
    });
    
    console.log(`✅ Created new X account for Mirancourt user (${tokenData.twitter_username})`);
  }

  // Test the token by making a simple API call
  try {
    const profile = await TwitterOAuth.getUserProfile(tokenData.access_token);
    console.log(`✅ Token test successful! Connected as ${profile.username} (${profile.id})`);
  } catch (error) {
    console.error(`❌ Token test failed:`, error);
    throw new Error(`Invalid access token: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function testPostTweet(text: string): Promise<void> {
  const userId = "7126459b-1411-4767-84ec-93625a44f067"; // Mirancourt user ID
  
  // Get the social account
  const socialAccount = await storage.getSocialAccountByPlatform(userId, "x");
  
  if (!socialAccount || !socialAccount.accessToken) {
    throw new Error("No X account found for Mirancourt user. Please run insertManualTokens first.");
  }

  try {
    const result = await TwitterOAuth.postTweet(socialAccount.accessToken, text);
    console.log(`✅ Test tweet posted successfully!`, result);
    console.log(`Tweet URL: https://twitter.com/${socialAccount.accountUsername}/status/${result.id}`);
    
    // Also save to database
    await storage.createPost({
      userId,
      accountId: socialAccount.id,
      content: text,
      platform: "x",
      platformPostId: result.id,
      status: "posted",
      error: null
    });
    
    console.log("✅ Tweet saved to database");
  } catch (error) {
    console.error(`❌ Test tweet failed:`, error);
    throw error;
  }
}