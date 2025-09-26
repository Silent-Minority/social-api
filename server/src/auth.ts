import express from 'express';
import { generatePKCE, retrieveCodeVerifier, buildAuthUrl, exchangeCodeForTokens, getUserProfile } from './oauth';
import { calculateTokenExpiration } from '../oauth';
import { storage } from '../storage';

const router = express.Router();

// Legacy aliases retained for backwards compatibility
router.get('/auth/twitter/start', (_req, res) => {
  res.redirect('/auth/x/start');
});

router.get('/auth/twitter/callback', (_req, res) => {
  res.redirect('/auth/x/callback');
});

// Start OAuth flow - redirect to Twitter/X
router.get('/auth/x/start', async (req, res) => {
  try {
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    
    // Debug-safe env presence log (no secrets)
    console.log('OAuth start env check', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!process.env.X_REDIRECT_URI,
      hasScopes: !!process.env.X_SCOPES
    });

    if (!clientId || !clientSecret) {
      console.error('OAuth start missing credentials', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret
      });
      return res.status(500).send('Twitter API credentials not configured. Please set X_CLIENT_ID and X_CLIENT_SECRET in environment variables.');
    }

    const redirectUri = process.env.X_REDIRECT_URI;
    const scopes = process.env.X_SCOPES;
    
    if (!redirectUri || !scopes) {
      console.error('OAuth start missing config', {
        hasRedirectUri: !!redirectUri,
        hasScopes: !!scopes
      });
      return res.status(500).send('OAuth configuration not complete. Please set X_REDIRECT_URI and X_SCOPES.');
    }

    const { codeVerifier, codeChallenge, state } = generatePKCE(res);
    
    // Persist PKCE state server-side as a fallback to cookies (avoids state loss behind proxies)
    try {
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
      await storage.createOauthState({
        state,
        codeVerifier,
        platform: 'x',
        userId: null,
        expiresAt
      } as any);
    } catch (persistErr) {
      console.warn('PKCE state DB persist failed (continuing with cookie only):', (persistErr as Error)?.message);
    }
    
    const authUrl = buildAuthUrl(clientId, redirectUri, state, codeChallenge, scopes);
    
    // Direct redirect to Twitter/X authorization page
    res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).send('Failed to start OAuth flow');
  }
});

// Helper function to clear OAuth cookies securely
function clearOAuthCookie(res: express.Response, state: string): void {
  const cookieName = `oauth_pkce_${state}`;
  res.clearCookie(cookieName, {
    httpOnly: true,
    signed: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: process.env.NODE_ENV === 'production' ? '.mirancourt.com' : undefined
  });
}

// Handle OAuth callback
router.get('/auth/x/callback', async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  
  try {
    // Handle OAuth provider errors first
    if (error) {
      console.error('❌ OAuth provider error:', { error, state });
      if (state) clearOAuthCookie(res, state);
      return res.status(400).send(`OAuth error: ${error}`);
    }
    
    // Validate required parameters
    if (!code || !state) {
      console.error('❌ Missing OAuth parameters:', { hasCode: !!code, hasState: !!state });
      if (state) clearOAuthCookie(res, state);
      return res.status(400).send('Missing authorization code or state parameter');
    }

    // Retrieve and validate PKCE data (includes explicit state validation)
    let codeVerifier = retrieveCodeVerifier(state, req, res);
    
    if (!codeVerifier) {
      console.warn('PKCE fallback: cookie missing for state', state);
      try {
        const dbState = await storage.getOauthState(state);
        if (dbState) {
          console.log('PKCE fallback: DB state found', {
            state: dbState.state,
            expiresAt: dbState.expiresAt
          });
        }
        if (dbState && dbState.expiresAt && new Date(dbState.expiresAt) > new Date()) {
          codeVerifier = dbState.codeVerifier as unknown as string;
        } else {
          console.warn('PKCE fallback: DB state missing or expired', {
            hasState: !!dbState,
            expiresAt: dbState?.expiresAt
          });
        }
      } catch (dbErr) {
        console.warn('PKCE state DB lookup failed:', (dbErr as Error)?.message);
      }
    }

    if (!codeVerifier) {
      console.error('❌ PKCE validation failed:', { 
        state, 
        reason: 'Invalid or expired OAuth state',
        securityAlert: true 
      });
      
      clearOAuthCookie(res, state);
      return res.status(400).json({ 
        error: "Invalid or expired OAuth state",
        debug: {
          received_state: state,
          timestamp: new Date().toISOString(),
          message: "State validation failed - possible CSRF attack or session timeout"
        }
      });
    }
    
    const clientId = process.env.X_CLIENT_ID!;
    const clientSecret = process.env.X_CLIENT_SECRET!;
    const redirectUri = process.env.X_REDIRECT_URI!;
    
    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(
      code,
      codeVerifier,
      clientId,
      clientSecret,
      redirectUri
    );

    // Get user profile
    const profile = await getUserProfile(tokenData.access_token);
    
    // Calculate token expiration using centralized function
    const expiresAt = tokenData.expires_in 
      ? calculateTokenExpiration(tokenData.expires_in)
      : null;
    
    // Create or find user
    let user;
    try {
      user = await storage.getUserByUsername(profile.username);
      if (!user) {
        user = await storage.createUser({
          username: profile.username,
          password: "oauth_user", // OAuth users don't need passwords
        });
      }
    } catch (error) {
      console.error("User creation error:", error);
      throw new Error("Failed to create user account");
    }

    // Store social account tokens
    try {
      const existingAccount = await storage.getSocialAccountByPlatform(user.id, "x");
      
      if (existingAccount) {
        await storage.updateSocialAccount(existingAccount.id, {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresAt,
          scope: tokenData.scope,
          accountUsername: profile.username,
          isActive: true,
        });
      } else {
        await storage.createSocialAccount({
          userId: user.id,
          platform: "x",
          accountId: profile.id,
          accountUsername: profile.username,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresAt,
          scope: tokenData.scope,
          isActive: true,
        });
      }
    } catch (socialAccountError: any) {
      console.error('❌ CRITICAL ERROR: Failed to store social account:', {
        error: socialAccountError,
        message: socialAccountError?.message,
        stack: socialAccountError?.stack,
        userId: user.id,
        twitterId: profile.id,
        username: profile.username
      });
      
      // Clear OAuth cookie on error
      clearOAuthCookie(res, state);
      
      // Return error to user - show details only in development
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorId = Math.random().toString(36).substring(2, 15); // Simple error correlation ID
      
      // Log error with correlation ID for production troubleshooting
      console.error(`❌ OAuth error [${errorId}]:`, {
        errorId,
        environment: process.env.NODE_ENV,
        message: socialAccountError?.message,
        userId: user.id,
        twitterId: profile.id,
        username: profile.username
      });
      
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Failed</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; 
                max-width: 500px; 
                margin: 100px auto; 
                padding: 20px; 
                text-align: center; 
              }
              .error { color: #dc2626; }
              .details { background: #fef2f2; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: left; }
            </style>
          </head>
          <body>
            <h1 class="error">Twitter Connection Failed</h1>
            ${isDevelopment ? `
              <div class="details">
                <strong>Error:</strong> Unable to save your Twitter account connection.<br>
                <strong>Details:</strong> ${socialAccountError?.message || 'Unknown error'}<br>
                <strong>User ID:</strong> ${user.id}<br>
                <strong>Twitter ID:</strong> ${profile.id}<br>
                <strong>Error ID:</strong> ${errorId}
              </div>
            ` : `
              <div class="details">
                <strong>Error:</strong> Unable to save your Twitter account connection.<br>
                <strong>Error ID:</strong> ${errorId}
              </div>
            `}
            <p>Please try connecting again or contact support if the issue persists.</p>
            <script>
              setTimeout(() => {
                window.close();
              }, 10000);
            </script>
          </body>
        </html>
      `);
    }
    
    // Attempt to remove server-side state if present
    try { await storage.deleteOauthState(state); } catch {}

    // Clear OAuth cookie on successful completion
    clearOAuthCookie(res, state);
    
    // Success redirect
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Twitter Connected</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; 
              max-width: 500px; 
              margin: 100px auto; 
              padding: 20px; 
              text-align: center; 
            }
            .success { color: #16a34a; }
            .info { color: #6b7280; margin-top: 20px; }
            .user-info { 
              background: #f9fafb; 
              border-radius: 8px; 
              padding: 16px; 
              margin: 20px 0; 
            }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Twitter Connected Successfully!</h1>
          <div class="user-info">
            <strong>@${profile.username}</strong><br>
            <small>User ID: ${user.id}</small><br>
            <small>X Account ID: ${profile.id}</small>
          </div>
          <p class="info">Your Twitter account has been connected. You can now close this window.</p>
          <script>
            // Close window after 3 seconds if it was opened in a popup
            if (window.opener) {
              setTimeout(() => window.close(), 3000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ OAuth callback error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      state,
      timestamp: new Date().toISOString()
    });
    
    // Clear OAuth cookie on error to prevent reuse
    if (state) {
      clearOAuthCookie(res, state);
    }
    
    res.status(500).send(`OAuth authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

export default router;
