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
  
  // Store the code verifier in a secure cookie (survives server restarts)
  const cookieValue = JSON.stringify({
    codeVerifier,
    timestamp: Date.now()
  });
  
  res.cookie(`oauth_pkce_${state}`, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 20 * 60 * 1000 // 20 minutes
  });
  
  // Also store in memory as fallback
  pkceStore.set(state, {
    codeVerifier,
    timestamp: Date.now()
  });
  
  console.log('🍪 PKCE data stored in cookie:', { state, cookieSet: true });
  
  return { codeVerifier, codeChallenge, state };
}

// Retrieve and remove PKCE code verifier
export function retrieveCodeVerifier(state: string, req: Request, res: Response): string | null {
  const cookieName = `oauth_pkce_${state}`;
  
  // First try to get from cookie (persistent across restarts)
  const cookieValue = req.cookies[cookieName];
  
  if (cookieValue) {
    try {
      const data = JSON.parse(cookieValue);
      const now = Date.now();
      const twentyMinutes = 20 * 60 * 1000;
      
      if (data.codeVerifier && (now - data.timestamp) < twentyMinutes) {
        // Clear the cookie
        res.clearCookie(cookieName);
        console.log('🍪 PKCE retrieved from cookie:', { state, found: true });
        return data.codeVerifier;
      }
    } catch (error) {
      console.error('Cookie parse error:', error);
    }
  }
  
  // Fallback to in-memory store
  const memData = pkceStore.get(state);
  console.log('🗂️  PKCE Store lookup:', { 
    cookieFound: !!cookieValue,
    memoryFound: !!memData, 
    storeSize: pkceStore.size
  });
  
  if (memData) {
    pkceStore.delete(state);
    return memData.codeVerifier;
  }
  
  return null;
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
    client_secret: clientSecret,
  });

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
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