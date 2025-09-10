import crypto from "crypto";
import { storage } from "./storage";

// OAuth 2.0 PKCE utilities for X (Twitter) API
export class TwitterOAuth {
  private static readonly TWITTER_OAUTH_URL = "https://twitter.com/i/oauth2/authorize";
  private static readonly TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
  private static readonly TWITTER_API_BASE = "https://api.twitter.com";

  // Generate PKCE code verifier and challenge
  static generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return { codeVerifier, codeChallenge };
  }

  // Generate OAuth state parameter
  static generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // Build authorization URL
  static buildAuthorizationUrl(
    clientId: string,
    redirectUri: string,
    scopes: string,
    state: string,
    codeChallenge: string
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${TwitterOAuth.TWITTER_OAUTH_URL}?${params.toString()}`;
  }

  // Exchange authorization code for access token
  static async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  }> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(TwitterOAuth.TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json();
  }

  // Post a tweet using OAuth 2.0 Bearer token
  static async postTweet(accessToken: string, content: string): Promise<{
    id: string;
    text: string;
  }> {
    const response = await fetch(`${TwitterOAuth.TWITTER_API_BASE}/2/tweets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: content }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tweet posting failed: ${error}`);
    }

    const data = await response.json();
    return data.data;
  }

  // Refresh an expired access token using the refresh token
  static async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  }> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(TwitterOAuth.TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    return response.json();
  }

  // Fetch tweet metrics
  static async fetchTweetMetrics(
    accessToken: string, 
    tweetIds: string[]
  ): Promise<Array<{
    id: string;
    public_metrics: {
      impression_count: number;
      retweet_count: number;
      like_count: number;
      reply_count: number;
      bookmark_count: number;
      quote_count: number;
    };
  }>> {
    const ids = tweetIds.join(',');
    const url = `${TwitterOAuth.TWITTER_API_BASE}/2/tweets?ids=${ids}&tweet.fields=public_metrics`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Metrics fetch failed: ${error}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  // Get user profile info
  static async getUserProfile(accessToken: string): Promise<{
    id: string;
    username: string;
    name: string;
  }> {
    const response = await fetch(`${TwitterOAuth.TWITTER_API_BASE}/2/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Profile fetch failed: ${error}`);
    }

    const data = await response.json();
    return data.data;
  }
}

// Helper function to calculate token expiration
export function calculateTokenExpiration(expiresIn: number): Date {
  return new Date(Date.now() + (expiresIn * 1000));
}

// Clean up expired OAuth states (run periodically)
export async function cleanupExpiredOAuthStates(): Promise<void> {
  // This would be implemented to clean up expired states from the database
  // For now, we'll leave this as a placeholder for a future cron job
  console.log("Cleaning up expired OAuth states...");
}