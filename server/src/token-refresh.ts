import { storage } from '../storage';
import { TwitterOAuth, calculateTokenExpiration } from '../oauth';

export interface TokenRefreshResult {
  accessToken: string;
  isRefreshed: boolean;
}

export interface TokenRefreshOptions {
  retryCount?: number;
  backoffMs?: number;
}

/**
 * Get a valid access token for a user and platform, automatically refreshing if needed
 * @param userId - The user ID
 * @param platform - The platform (e.g., 'x')
 * @param options - Options for retry behavior
 * @returns Valid access token and whether it was refreshed
 * @throws Error if token cannot be refreshed or account is inactive
 */
export async function getValidAccessToken(
  userId: string,
  platform: string,
  options: TokenRefreshOptions = {}
): Promise<TokenRefreshResult> {
  const { retryCount = 2, backoffMs = 1000 } = options;

  // Get the social account for this user and platform
  const socialAccount = await storage.getSocialAccountByPlatform(userId, platform);
  
  if (!socialAccount) {
    throw new Error(`No ${platform} account found for user ${userId}`);
  }

  if (!socialAccount.isActive) {
    throw new Error(`${platform} account for user ${userId} is inactive`);
  }

  if (!socialAccount.accessToken) {
    throw new Error(`No access token found for ${platform} account`);
  }

  // Check if token is expired or near expiry (2-minute buffer)
  const now = new Date();
  const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);
  const needsRefresh = socialAccount.tokenExpiresAt && socialAccount.tokenExpiresAt <= twoMinutesFromNow;

  if (!needsRefresh) {
    console.log(`Token for ${platform} account ${socialAccount.accountUsername} is still valid`);
    return {
      accessToken: socialAccount.accessToken,
      isRefreshed: false
    };
  }

  // Token needs refresh
  console.log(`Token for ${platform} account ${socialAccount.accountUsername} needs refresh`, {
    expiresAt: socialAccount.tokenExpiresAt,
    now: now.toISOString(),
    twoMinutesFromNow: twoMinutesFromNow.toISOString()
  });

  if (!socialAccount.refreshToken) {
    // Mark account as inactive since we can't refresh
    await storage.updateSocialAccount(socialAccount.id, { isActive: false });
    throw new Error(`No refresh token available for ${platform} account. Re-authentication required.`);
  }

  // Get OAuth credentials
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('OAuth credentials not configured');
  }

  let lastError: Error | null = null;
  
  // Retry logic with exponential backoff
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      console.log(`Attempting token refresh for ${platform} account (attempt ${attempt + 1}/${retryCount + 1})`);
      
      const refreshedTokens = await TwitterOAuth.refreshAccessToken(
        socialAccount.refreshToken,
        clientId,
        clientSecret
      );

      // Calculate new expiration with buffer
      const newExpiresAt = calculateTokenExpiration(refreshedTokens.expires_in);
      
      // Update social account with new tokens
      // Handle potential refresh token rotation
      const updatedAccount = await storage.updateSocialAccount(socialAccount.id, {
        accessToken: refreshedTokens.access_token,
        refreshToken: refreshedTokens.refresh_token || socialAccount.refreshToken,
        tokenExpiresAt: newExpiresAt,
        scope: refreshedTokens.scope,
        isActive: true // Ensure account remains active after successful refresh
      });

      if (!updatedAccount) {
        throw new Error('Failed to update social account with new tokens');
      }

      console.log(`✅ Token refresh successful for ${platform} account ${socialAccount.accountUsername}`, {
        newExpiresAt: newExpiresAt.toISOString(),
        hasNewRefreshToken: !!refreshedTokens.refresh_token,
        scope: refreshedTokens.scope
      });

      return {
        accessToken: refreshedTokens.access_token,
        isRefreshed: true
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Token refresh attempt ${attempt + 1} failed:`, lastError.message);

      // Check if this is a permanent failure (invalid refresh token)
      if (lastError.message.includes('invalid') || lastError.message.includes('expired')) {
        console.error(`Refresh token appears to be invalid or expired for ${platform} account`);
        
        // Mark account as inactive
        await storage.updateSocialAccount(socialAccount.id, { isActive: false });
        
        throw new Error(`Refresh token invalid or expired for ${platform} account. Re-authentication required.`);
      }

      // For network errors, retry with backoff
      if (attempt < retryCount) {
        const delay = backoffMs * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retry attempts failed
  console.error(`❌ Token refresh failed after ${retryCount + 1} attempts for ${platform} account`);
  throw new Error(`Failed to refresh token after ${retryCount + 1} attempts: ${lastError?.message}`);
}

/**
 * Validate and refresh tokens for all active social accounts (maintenance function)
 * @returns Summary of refresh operations
 */
export async function refreshAllExpiredTokens(): Promise<{
  total: number;
  refreshed: number;
  failed: number;
  errors: string[];
}> {
  const allAccounts = await storage.getSocialAccounts();
  const activeAccounts = allAccounts.filter(account => account.isActive && account.refreshToken);

  console.log(`🔄 Starting bulk token refresh for ${activeAccounts.length} active accounts`);

  const results = {
    total: activeAccounts.length,
    refreshed: 0,
    failed: 0,
    errors: [] as string[]
  };

  for (const account of activeAccounts) {
    try {
      const result = await getValidAccessToken(account.userId, account.platform);
      if (result.isRefreshed) {
        results.refreshed++;
        console.log(`✅ Refreshed token for ${account.platform} account ${account.accountUsername}`);
      }
    } catch (error) {
      results.failed++;
      const errorMsg = `Failed to refresh ${account.platform} account ${account.accountUsername}: ${error instanceof Error ? error.message : String(error)}`;
      results.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }
  }

  console.log(`🎯 Bulk refresh complete:`, results);
  return results;
}