import crypto from 'crypto';
import { Request, Response } from 'express';

// In-memory storage for PKCE verifiers (fallback only)
const pkceStore = new Map<string, { codeVerifier: string; timestamp: number }>();

// Clean up expired PKCE verifiers (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  
  pkceStore.forEach((data, state) => {
    if (now - data.timestamp > tenMinutes) {
      pkceStore.delete(state);
    }
  });
}, 5 * 60 * 1000); // Clean up every 5 minutes

// Generate PKCE code verifier and challenge
export function generatePKCE(res: Response): { codeVerifier: string; codeChallenge: string; state: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  const state = crypto.randomBytes(16).toString('hex');
  
  // Store PKCE data including state in a secure signed cookie
  const cookiePayload = {
    codeVerifier,
    state,
    timestamp: Date.now()
  };
  
  const cookieOptions = {
    httpOnly: true,
    signed: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 20 * 60 * 1000, // 20 minutes
    domain: process.env.NODE_ENV === 'production' ? '.mirancourt.com' : undefined // Allow subdomains in production
  };
  
  res.cookie(`oauth_pkce_${state}`, JSON.stringify(cookiePayload), cookieOptions);
  
  // Also store in memory as fallback
  pkceStore.set(state, {
    codeVerifier,
    timestamp: Date.now()
  });
  
  
  return { codeVerifier, codeChallenge, state };
}

// Retrieve and validate PKCE code verifier with state validation
export function retrieveCodeVerifier(state: string, req: Request, res: Response): string | null {
  const cookieName = `oauth_pkce_${state}`;
  
  
  // First try to get from signed cookie (persistent across restarts)
  const cookieValue = req.signedCookies[cookieName];
  
  if (cookieValue) {
    try {
      const data = JSON.parse(cookieValue);
      const now = Date.now();
      const twentyMinutes = 20 * 60 * 1000;
      
      
      // Explicit state validation - critical security check
      if (data.state !== state) {
        clearSecureCookie(res, cookieName);
        return null;
      }
      
      if (data.codeVerifier && (now - data.timestamp) < twentyMinutes) {
        // Clear the cookie with matching options
        clearSecureCookie(res, cookieName);
        return data.codeVerifier;
      }
      
      // Cookie expired
      clearSecureCookie(res, cookieName);
      
    } catch (error) {
      clearSecureCookie(res, cookieName);
    }
  }
  
  // Fallback to in-memory store (but still validate state)
  const memData = pkceStore.get(state);
  
  if (memData) {
    pkceStore.delete(state);
    return memData.codeVerifier;
  }
  
  return null;
}

// Helper function to clear cookies with matching security options
function clearSecureCookie(res: Response, cookieName: string): void {
  res.clearCookie(cookieName, {
    httpOnly: true,
    signed: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
}

// Build Twitter OAuth authorization URL
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  scopes?: string
): string {
  const oauthScopes = scopes || 'tweet.read tweet.write users.read offline.access';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: oauthScopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

// Exchange authorization code for access token
export async function exchangeCodeForTokens(
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
  });

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

// Get user profile from Twitter API
export async function getUserProfile(accessToken: string): Promise<{
  id: string;
  username: string;
  name: string;
}> {
  const response = await fetch('https://api.twitter.com/2/users/me', {
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

// Refresh access token using refresh token
export async function refreshAccessToken(
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
  });

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

// Calculate token expiration date from expires_in seconds
export function calculateTokenExpiration(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000);
}