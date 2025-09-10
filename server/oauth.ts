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

  // Post a tweet using OAuth 1.0a (required for posting tweets)
  static async postTweet(accessToken: string, content: string): Promise<{
    id: string;
    text: string;
  }> {
    // For posting tweets, we need OAuth 1.0a authentication
    // The accessToken stored is actually the OAuth 1.0a access token
    // We need to use OAuth 1.0a signing instead of Bearer token
    
    const { X_API_KEY: consumerKey, X_API_SECRET: consumerSecret } = process.env;
    const { X_ACCESS_TOKEN: oauthToken, X_ACCESS_TOKEN_SECRET: oauthTokenSecret } = process.env;
    
    if (!consumerKey || !consumerSecret || !oauthToken || !oauthTokenSecret) {
      throw new Error("Missing OAuth 1.0a credentials for posting tweets");
    }

    // Generate OAuth 1.0a authorization header
    const oauth = TwitterOAuth.generateOAuth1aHeader(
      'POST',
      `${TwitterOAuth.TWITTER_API_BASE}/2/tweets`,
      consumerKey,
      consumerSecret,
      oauthToken,
      oauthTokenSecret
    );

    const response = await fetch(`${TwitterOAuth.TWITTER_API_BASE}/2/tweets`, {
      method: 'POST',
      headers: {
        'Authorization': oauth,
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

  // Generate OAuth 1.0a authorization header
  static generateOAuth1aHeader(
    method: string,
    url: string,
    consumerKey: string,
    consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
  ): string {
    const oauthNonce = crypto.randomBytes(16).toString('hex');
    const oauthTimestamp = Math.floor(Date.now() / 1000).toString();
    
    const params: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: oauthNonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: oauthTimestamp,
      oauth_token: accessToken,
      oauth_version: '1.0',
    };

    // Create signature base string
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
    
    const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    
    // Create signing key
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;
    
    // Generate signature
    const signature = crypto.createHmac('sha1', signingKey)
      .update(signatureBaseString)
      .digest('base64');
    
    params.oauth_signature = signature;

    // Build authorization header
    const authHeader = 'OAuth ' + Object.keys(params)
      .sort()
      .map(key => `${key}="${encodeURIComponent(params[key])}"`)
      .join(', ');

    return authHeader;
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