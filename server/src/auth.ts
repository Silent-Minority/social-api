import express from 'express';
import { generatePKCE, retrieveCodeVerifier, buildAuthUrl, exchangeCodeForTokens, getUserProfile } from './oauth';
import { storage } from '../storage';

const router = express.Router();

// Start OAuth flow - redirect to Twitter
router.get('/auth/x/start', (req, res) => {
  try {
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).send('Twitter API credentials not configured. Please set X_CLIENT_ID and X_CLIENT_SECRET in Replit Secrets.');
    }

    const { codeChallenge, state } = generatePKCE();
    const redirectUri = 'https://api.mirancourt.com/auth/x/callback';
    
    const authUrl = buildAuthUrl(clientId, redirectUri, state, codeChallenge);
    
    console.log('🚀 OAuth start - State generated:', state);
    
    // Direct redirect to Twitter
    res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).send('Failed to start OAuth flow');
  }
});

// Handle OAuth callback
router.get('/auth/x/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    
    console.log('📞 OAuth callback received:', { code: !!code, state, error });
    
    if (error) {
      return res.status(400).send(`OAuth error: ${error}`);
    }
    
    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state parameter');
    }

    const codeVerifier = retrieveCodeVerifier(state);
    console.log('🔑 Code verifier retrieval:', { state, found: !!codeVerifier });
    
    if (!codeVerifier) {
      return res.status(400).json({ 
        error: "Invalid or expired OAuth state",
        debug: {
          received_state: state,
          timestamp: new Date().toISOString()
        }
      });
    }

    const clientId = process.env.X_CLIENT_ID!;
    const clientSecret = process.env.X_CLIENT_SECRET!;
    const redirectUri = 'https://api.mirancourt.com/auth/x/callback';
    
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
    
    // Calculate token expiration
    const expiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000)
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
    console.error('OAuth callback error:', error);
    res.status(500).send(`OAuth authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

export default router;