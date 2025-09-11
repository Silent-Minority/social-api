import crypto from 'crypto';

// In-memory storage for PKCE verifiers (in production, use Redis or similar)
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
export function generatePKCE(): { codeVerifier: string; codeChallenge: string; state: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  const state = crypto.randomBytes(16).toString('hex');
  
  // Store the code verifier temporarily
  pkceStore.set(state, {
    codeVerifier,
    timestamp: Date.now()
  });
  
  return { codeVerifier, codeChallenge, state };
}

// Retrieve and remove PKCE code verifier
export function retrieveCodeVerifier(state: string): string | null {
  const data = pkceStore.get(state);
  console.log('🗂️  PKCE Store lookup:', { 
    state, 
    found: !!data, 
    storeSize: pkceStore.size,
    allStates: Array.from(pkceStore.keys())
  });
  
  if (!data) return null;
  
  pkceStore.delete(state);
  return data.codeVerifier;
}

// Build Twitter OAuth authorization URL
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const scopes = 'tweet.read tweet.write users.read offline.access';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
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