import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cors from "cors";
import { DEMO_USER_ID } from "./auth";
import { getValidAccessToken as getValidAccessTokenInternal } from "./src/token-refresh";
import * as xService from "./services/x";
import userRoutes from "./routes/userRoutes";
import postRoutes from "./routes/postRoutes";
import { insertManualTokens, testPostTweet } from "./manual-token-setup";
import { postTweet } from "./controllers/postController";
import { getUserProfile } from "./controllers/userController";

// Simplified wrapper for getting valid access token from default X account
async function getValidAccessToken(accountType: string): Promise<string> {
  if (accountType !== "default") {
    throw new Error("Only 'default' account type is supported");
  }

  // Find the most recent active X account
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
  const socialAccount = xAccounts.sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const tokenResult = await getValidAccessTokenInternal(socialAccount.userId, "x");
  return tokenResult.accessToken;
}

// Flask-compatible function that returns access token or null if no account found
async function resolveAccountAndToken(accountType: string): Promise<string | null> {
  try {
    return await getValidAccessToken(accountType);
  } catch (error) {
    // Return null if no account found (Flask behavior)
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS middleware
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }));

  // API logging middleware
  app.use(async (req, res, next) => {    const start = Date.now();
    
    res.on('finish', async () => {
      const responseTime = Date.now() - start;
      await storage.createApiLog({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
      });
    });
    
    next();
  });

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // OAuth debug endpoint
  app.get("/api/oauth/debug", (req, res) => {
    res.json({
      hasClientId: !!process.env.X_CLIENT_ID,
      hasClientSecret: !!process.env.X_CLIENT_SECRET,
      hasRedirectUri: !!process.env.X_REDIRECT_URI,
      hasScopes: !!process.env.X_SCOPES,
      environment: process.env.NODE_ENV,
      port: process.env.PORT
    });
  });

  // Compatibility alias for legacy dashboard calls
  // Some clients call /api/auth/twitter; redirect them to the current OAuth start route
  app.get('/api/auth/twitter', (_req, res) => {
    res.redirect('/auth/twitter/start');
  });

  // Handle POST mistakenly sent to the legacy path by issuing a 303 to the GET start route
  app.post('/api/auth/twitter', (_req, res) => {
    res.redirect(303, '/auth/twitter/start');
  });

  // API status endpoint with connected accounts and posts
  app.get("/api/status", async (req, res) => {
    try {
      const stats = await storage.getStats();
      
      // Get connected accounts info (for demo, showing first user's accounts)
      let connectedAccounts: any[] = [];
      let recentPosts: any[] = [];
      
      try {
        // In a real app, you'd get this from the authenticated user
        // For demo, get all active social accounts from any user
        let allAccounts = await storage.getSocialAccounts();
        
        // Filter to only active accounts with valid tokens
        allAccounts = allAccounts.filter(account => account.isActive);
        
        // If no accounts found, try the hardcoded demo fallback
        if (allAccounts.length === 0) {
          const demoUser = await storage.getUserByUsername("demo_user");
          if (demoUser) {
            allAccounts = await storage.getSocialAccountsByUser(demoUser.id);
          }
        }
        connectedAccounts = allAccounts.map(account => ({
          platform: account.platform,
          username: account.accountUsername,
          isActive: account.isActive,
          connectedAt: account.createdAt,
          hasValidToken: !!account.accessToken && 
            (!account.tokenExpiresAt || account.tokenExpiresAt > new Date())
        }));

        // For each account, get recent posts linked to that account
        const accountsWithPosts = await Promise.all(
          allAccounts.map(async (account) => {
            // Get recent posts for this specific account
            const posts = await storage.getPostsByAccount(account.id);
            
            return {
              accountId: account.accountId, // Platform account ID (Twitter ID)
              platform: account.platform,
              username: account.accountUsername,
              isActive: account.isActive,
              connectedAt: account.createdAt,
              hasValidToken: !!account.accessToken && 
                (!account.tokenExpiresAt || account.tokenExpiresAt > new Date()),
              recentPosts: posts.slice(0, 10).map(post => ({
                platformPostId: post.platformPostId,
                content: post.content,
                status: post.status,
                createdAt: post.createdAt
              }))
            };
          })
        );
        
        connectedAccounts = accountsWithPosts;
      } catch (userError: any) {
        // If no users exist yet, that's fine - just return empty arrays
        console.log("No user data available yet:", userError?.message || userError);
        // Reset to empty arrays on error to ensure consistent response structure
        connectedAccounts = [];
      }
      
      res.json({
        server: "online",
        port: process.env.PORT || 5000,
        environment: process.env.NODE_ENV || "development",
        ...stats,
        connectedAccounts
      });
    } catch (error) {
      console.error("Status endpoint error:", error);
      res.status(500).json({ error: "Failed to get server status" });
    }
  });

  // Environment configuration endpoint
  app.get("/api/config", (req, res) => {
    const config = {
      port: process.env.PORT || 5000,
      corsOrigin: process.env.CORS_ORIGIN || "*",
      twitterClientId: !!process.env.X_CLIENT_ID,
      twitterClientSecret: !!process.env.X_CLIENT_SECRET,
      jwtSecret: process.env.JWT_SECRET ? "configured" : "default",
    };
    res.json(config);
  });

  // Recent logs endpoint
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const logs = await storage.getRecentLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      res.status(500).json({ error: "Failed to get logs" });
    }
  });



  // Get posts for a user
  app.get("/api/posts/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const posts = await storage.getPostsByUser(userId);
      res.json(posts);
    } catch (error) {
      console.error("Failed to fetch posts for user:", req.params.userId, error);
      res.status(500).json({ error: "Failed to get posts" });
    }
  });

  // Batch metrics job - fetch tweet analytics
  app.post("/api/metrics/fetch", async (req, res) => {
    try {
      // Find the most recent active X account
      // In production, get from authenticated session
      const allAccounts = await storage.getSocialAccounts();
      const xAccounts = allAccounts.filter((acc: any) => 
        (acc.platform === "x" || acc.platform === "twitter") && 
        acc.isActive && 
        (acc.accessToken || acc.refreshToken)
      );
      
      if (xAccounts.length === 0) {
        return res.status(400).json({ 
          error: "No connected X account found",
          suggestion: "Please connect your X account first via /auth/twitter/start"
        });
      }
      
      // Use the most recently connected X account
      let socialAccount = xAccounts.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      // Get valid access token for metrics (automatically refreshes if needed)
      let validAccessToken: string;
      try {
        const tokenResult = await getValidAccessTokenInternal(socialAccount.userId, "x");
        validAccessToken = tokenResult.accessToken;
        
        if (tokenResult.isRefreshed) {
          console.log("✅ Token refreshed successfully for metrics fetch");
          // Re-fetch the updated social account to get the latest token info
          const updatedAccount = await storage.getSocialAccountByPlatform(socialAccount.userId, "x");
          if (updatedAccount) {
            socialAccount = updatedAccount;
          }
        }
      } catch (tokenError: any) {
        console.error("❌ Token validation/refresh failed for metrics:", tokenError);
        return res.status(401).json({
          error: "Failed to obtain valid access token for metrics",
          suggestion: "Please re-authenticate your X account",
          details: tokenError?.message
        });
      }

      // Get recent posts that have tweet IDs but no recent metrics - use the same user as the social account
      const posts = await storage.getPostsByUser(socialAccount.userId);
      const postsWithTweetIds = posts.filter(post => 
        post.platform === "x" && 
        post.status === "posted" && 
        post.platformPostId
      );

      if (postsWithTweetIds.length === 0) {
        return res.json({ 
          message: "No tweets found to fetch metrics for",
          processed: 0 
        });
      }

      const { TwitterOAuth } = await import("./oauth");
      const tweetIds = postsWithTweetIds.map(post => post.platformPostId!);
      
      try {
        // Fetch metrics from X API using the validated access token
        const metricsData = await TwitterOAuth.fetchTweetMetrics(
          validAccessToken,
          tweetIds
        );

        let processed = 0;
        
        // Store metrics in database
        for (const metric of metricsData) {
          const post = postsWithTweetIds.find(p => p.platformPostId === metric.id);
          if (post) {
            await storage.createTweetMetrics({
              postId: post.id,
              tweetId: metric.id,
              impressionCount: metric.public_metrics.impression_count,
              retweetCount: metric.public_metrics.retweet_count,
              likeCount: metric.public_metrics.like_count,
              replyCount: metric.public_metrics.reply_count,
              bookmarkCount: metric.public_metrics.bookmark_count,
              quoteCount: metric.public_metrics.quote_count,
            });
            processed++;
          }
        }

        res.json({
          message: `Successfully fetched metrics for ${processed} tweets`,
          processed,
          tweetIds: metricsData.map(m => m.id)
        });
      } catch (metricsError: any) {
        console.error("Metrics fetch error:", metricsError);
        res.status(500).json({ 
          error: "Failed to fetch metrics from X API",
          details: metricsError?.message || String(metricsError)
        });
      }
    } catch (error) {
      console.error("Metrics job error:", error);
      res.status(500).json({ error: "Failed to run metrics job" });
    }
  });

  // Get all social accounts (for authentication page)
  app.get("/api/social-accounts", async (req, res) => {
    try {
      // For demo purposes, get all accounts from all users
      // In production, filter by authenticated user
      const accounts = await storage.getSocialAccounts();
      
      // 🔒 SECURITY: Strip sensitive token data from response
      const sanitizedAccounts = accounts.map(account => ({
        id: account.id,
        platform: account.platform,
        accountId: account.accountId,
        accountUsername: account.accountUsername,
        isActive: account.isActive,
        hasValidToken: !!account.accessToken && 
          (!account.tokenExpiresAt || account.tokenExpiresAt > new Date()),
        connectedAt: account.createdAt,
        tokenExpiresAt: account.tokenExpiresAt,
        scope: account.scope
        // accessToken and refreshToken are deliberately excluded for security
      }));
      
      res.json(sanitizedAccounts);
    } catch (error) {
      console.error("Error fetching social accounts:", error);
      res.status(500).json({ error: "Failed to get social accounts" });
    }
  });

  // Get auth status
  app.get("/api/auth/status", async (req, res) => {
    try {
      // For demo purposes, return basic auth status
      // In production, return actual user authentication status
      res.json({ 
        authenticated: false, // Change to true when user is logged in
        user: null 
      });
    } catch (error) {
      console.error("Error getting auth status:", error);
      res.status(500).json({ error: "Failed to get auth status" });
    }
  });

  // Get user's connected accounts
  app.get("/api/accounts/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const accounts = await storage.getSocialAccountsByUser(userId);
      
      res.json({
        accounts: accounts.map(account => ({
          id: account.id,
          platform: account.platform,
          username: account.accountUsername,
          isActive: account.isActive,
          hasValidToken: !!account.accessToken && 
            (!account.tokenExpiresAt || account.tokenExpiresAt > new Date()),
          connectedAt: account.createdAt,
          tokenExpiresAt: account.tokenExpiresAt,
          scope: account.scope
        }))
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user accounts" });
    }
  });

  // Test token refresh functionality
  app.post("/api/test/token-refresh", async (req, res) => {
    try {
      const { runAllTokenRefreshTests } = await import("./src/test-token-refresh");
      
      console.log("🧪 Starting token refresh tests via API endpoint...");
      await runAllTokenRefreshTests();
      
      res.json({
        success: true,
        message: "Token refresh tests completed successfully",
        timestamp: new Date().toISOString(),
        testResults: "All tests passed - check server logs for detailed results"
      });
    } catch (error) {
      console.error("❌ Token refresh tests failed:", error);
      res.status(500).json({
        success: false,
        error: "Token refresh tests failed",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get metrics for specific tweet IDs
  app.get("/api/metrics", async (req, res, next) => {
    try {
      let ids: string[] = [];

      // support ?ids=123,456 or ?ids[]=123&ids[]=456
      if (Array.isArray(req.query.ids)) {
        ids = (req.query.ids as string[]).map(s => s.trim()).filter(Boolean);
      } else if (typeof req.query.ids === "string") {
        ids = req.query.ids.split(",").map(s => s.trim()).filter(Boolean);
      }

      if (!ids.length) {
        return res.status(400).json({
          error: "Missing tweet ids",
          hint: "Pass ?ids=123,456 or ?ids[]=123&ids[]=456"
        });
      }

      // ...lookup account, get token, build request
      const access = await getValidAccessToken("default");
      const url = new URL("https://api.x.com/2/tweets");
      url.searchParams.set("ids", ids.join(","));
      url.searchParams.set("tweet.fields", "public_metrics,created_at");

      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${access}` }
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return res.status(502).json({
          error: "X API error",
          status: r.status,
          details: data
        });
      }

      return res.json(data);
    } catch (err) {
      return next(err);
    }
  });

  // Shared timeline handler function
  async function handleTimelineRequest(req: any, res: any, next: any) {
    try {
      // Resolve account and get valid access token in one call
      const accountResult = await xService.resolveAccountAndToken();
      if (!accountResult) {
        return res.status(400).json({
          error: "No connected X account found",
          suggestion: "Connect via /auth/twitter/start"
        });
      }

      // Parse query parameters with proper validation
      const count = xService.validateTweetCount(req.query.count as string);
      const paginationToken = req.query.pagination_token as string;
      const tweetFields = req.query.tweet_fields as string || "created_at,public_metrics";

      // Fetch user's tweets
      const { response, data } = await xService.fetchUserTweets(
        accountResult.accessToken,
        accountResult.accountId,
        {
          max_results: count,
          pagination_token: paginationToken,
          tweet_fields: tweetFields
        }
      );

      if (!response.ok) {
        return res.status(502).json({
          error: "X API error",
          status: response.status,
          details: data
        });
      }

      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }

  // Get user's timeline (their own tweets)
  app.get("/api/timeline", handleTimelineRequest);

  // Get recent tweets (alias to /api/timeline for backward compatibility)
  // @deprecated Use /api/timeline instead
  app.get("/api/recent-tweets", async (req, res, next) => {
    // Add deprecation headers
    res.setHeader("Deprecation", "true");
    res.setHeader("Warning", '299 - "This endpoint is deprecated. Use /api/timeline instead."');
    
    // Log deprecation warning
    console.warn("📢 DEPRECATED: /api/recent-tweets endpoint used. Please migrate to /api/timeline");
    
    // Delegate to shared handler (eliminates duplication)
    return handleTimelineRequest(req, res, next);
  });

  // Mount user routes
  app.use("/api/user", userRoutes);

  // Mount post routes - includes POST /api/posts handler from controller
  // ✅ FIXED: Removed duplicate inline POST handler to prevent conflicts
  app.use("/api/posts", postRoutes);

  // POST /api/posts/airtable
  // Create a tweet via Twitter API and return id and text for Airtable
  app.post('/api/posts/airtable', async (req, res) => {
    const { content, text, accountId } = req.body;
    const tweetText = content || text; // Support both 'content' and 'text' fields

    if (!tweetText) {
      return res.status(400).json({ error: 'Missing tweet text (provide "content" or "text" field)' });
    }

    try {
      // Use existing token system instead of accounts object
      const accessToken = await getValidAccessToken(accountId || 'default');

      const tweetResp = await fetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text: tweetText }),
      });

      const result = await tweetResp.json();

      if (!tweetResp.ok) {
        return res.status(tweetResp.status).json({ 
          error: 'Failed to post tweet',
          details: result 
        });
      }

      const tweetId = result.data?.id;
      
      // Get the username for the URL - need to fetch account info to construct the Twitter URL
      const allAccounts = await storage.getSocialAccounts();
      const xAccounts = allAccounts.filter((acc: any) => 
        (acc.platform === "x" || acc.platform === "twitter") && 
        acc.isActive && 
        (acc.accessToken || acc.refreshToken)
      );
      
      if (xAccounts.length === 0) {
        return res.status(400).json({ 
          error: "No connected X account found for URL generation"
        });
      }
      
      // Use the most recently connected X account
      const socialAccount = xAccounts.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      
      if (!socialAccount.accountUsername) {
        return res.status(500).json({
          error: "Account configuration error",
          message: "No username stored for connected account"
        });
      }

      // Airtable expects { id, url }
      return res.json({ 
        id: tweetId, 
        url: `https://twitter.com/${socialAccount.accountUsername}/status/${tweetId}` 
      });
    } catch (err: any) {
      console.error('Posting error', err);
      if (err.message.includes('No connected X account')) {
        return res.status(400).json({ error: 'No access token found for this account' });
      }
      return res.status(500).json({ error: 'Failed to post tweet' });
    }
  });

  // POST /api/post
  // Exact Flask specification endpoint - posts tweet and returns raw Twitter API response
  app.post('/api/post', async (req, res) => {
    const data = req.body;
    
    // Check if data exists and has 'text' field (exact Flask behavior)
    if (!data || !('text' in data)) {
      return res.status(400).json({ error: "No text provided" });
    }
    
    // Get access token using Flask-compatible function
    const access_token = await resolveAccountAndToken('default');
    if (!access_token) {
      return res.status(401).json({ 
        error: "No connected X account", 
        suggestion: "/auth/twitter/start" 
      });
    }
    
    // Post to Twitter API (exact Flask implementation)
    const headers = {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    };
    const payload = { text: data.text };
    
    try {
      const response = await fetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      // Return raw Twitter response for success (status 201) or error with response text
      if (response.status === 201) {
        const result = await response.json();
        return res.json(result);
      } else {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }
    } catch (err: any) {
      // Handle fetch errors
      return res.status(500).json({ error: err.message || 'Request failed' });
    }
  });

  // Test endpoint for API verification
  app.get("/api/test", (req, res) => {
    res.json({ 
      message: "Mirancourt Social API is working",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      endpoints: {
        oauth: {
          start: "GET /auth/twitter/start",
          callback: "GET /auth/twitter/callback"
        },
        posting: "POST /api/post",
        metrics: {
          fetch: "POST /api/metrics/fetch",
          query: "GET /api/metrics?ids=comma,separated,tweet,ids"
        },
        accounts: "GET /api/accounts/:userId",
        posts: "GET /api/posts/:userId",
        status: "GET /api/status (with accounts and posts)",
        health: "GET /health",
        testing: {
          tokenRefresh: "POST /api/test/token-refresh"
        }
      }
    });
  });

  // 🔒 SECURITY: Admin middleware for temporary endpoints
  const adminAuthMiddleware = (req: any, res: any, next: any) => {
    const adminToken = process.env.ADMIN_TOKEN;
    
    if (!adminToken) {
      return res.status(500).json({
        error: "Server configuration error",
        message: "ADMIN_TOKEN environment variable not configured"
      });
    }
    
    const providedToken = req.headers['x-admin-token'] || req.body.admin_token;
    
    if (!providedToken) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "ADMIN_TOKEN required in X-Admin-Token header or admin_token body field"
      });
    }
    
    if (providedToken !== adminToken) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Invalid ADMIN_TOKEN"
      });
    }
    
    next();
  };

  // TEMPORARY: Manual token insertion endpoint for troubleshooting OAuth callback issues
  // 🔒 SECURED: Requires ADMIN_TOKEN for access
  // This allows manual insertion of OAuth tokens when callbacks aren't reaching the server
  app.post("/api/admin/insert-tokens", adminAuthMiddleware, async (req, res) => {
    try {
      const { access_token, refresh_token, expires_in, scope, twitter_user_id, twitter_username } = req.body;
      
      if (!access_token || !twitter_user_id || !twitter_username) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["access_token", "twitter_user_id", "twitter_username"]
        });
      }

      // 🔒 VALIDATION: Validate token before persisting to avoid bad state
      try {
        const { TwitterOAuth } = await import("./oauth");
        const profile = await TwitterOAuth.getUserProfile(access_token);
        
        // Verify the token belongs to the expected user
        if (profile.id !== twitter_user_id || profile.username !== twitter_username) {
          return res.status(400).json({
            error: "Token validation failed",
            message: "Access token does not match provided user ID or username",
            expected: { id: twitter_user_id, username: twitter_username },
            actual: { id: profile.id, username: profile.username }
          });
        }
      } catch (validationError) {
        return res.status(400).json({
          error: "Invalid access token",
          message: "Token validation failed - token may be expired or invalid",
          details: validationError instanceof Error ? validationError.message : String(validationError)
        });
      }
      
      await insertManualTokens({
        access_token,
        refresh_token,
        expires_in,
        scope,
        twitter_user_id,
        twitter_username
      });
      
      res.json({ 
        success: true, 
        message: `Successfully inserted and validated tokens for @${twitter_username}`,
        tokenValidated: true
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to insert tokens",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // TEMPORARY: Test tweet endpoint for verifying the setup works
  // 🔒 SECURED: Requires ADMIN_TOKEN for access
  app.post("/api/admin/test-tweet", adminAuthMiddleware, async (req, res) => {
    try {
      const { text = "Test tweet from manual token setup 🚀" } = req.body;
      
      const result = await testPostTweet(text);
      
      res.json({ 
        success: true, 
        message: "Test tweet posted successfully! Check the console for details.",
        tweetDetails: result
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Test tweet failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
