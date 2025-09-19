import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cors from "cors";
import { DEMO_USER_ID } from "./auth";
import { getValidAccessToken as getValidAccessTokenInternal } from "./src/token-refresh";
import * as xService from "./services/x";
import { getUserProfile } from "./controllers/userController";

// Simplified wrapper for getting valid access token from default X account
async function getValidAccessToken(accountType: string): Promise<string> {
  if (accountType !== "default") {
    throw new Error("Only 'default' account type is supported");
  }

  // Find the most recent active X account
  const allAccounts = await storage.getSocialAccounts();
  const xAccounts = allAccounts.filter((acc: any) => 
    acc.platform === "x" && 
    acc.isActive && 
    acc.accessToken
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

  // API status endpoint with connected accounts and posts
  app.get("/api/status", async (req, res) => {
    try {
      const stats = await storage.getStats();
      
      // Get connected accounts info (for demo, showing first user's accounts)
      let connectedAccounts: any[] = [];
      let recentPosts: any[] = [];
      
      try {
        // In a real app, you'd get this from the authenticated user
        // For demo, try to find any existing demo user account
        // First try by the hardcoded demo ID, then by username
        let allAccounts = await storage.getSocialAccountsByUser(DEMO_USER_ID);
        if (allAccounts.length === 0) {
          // Try to find demo user by username instead
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

        // Get recent posts with metrics
        if (allAccounts.length > 0) {
          recentPosts = await storage.getPostsWithMetrics(allAccounts[0].userId, 10);
        }
      } catch (userError: any) {
        // If no users exist yet, that's fine - just return empty arrays
        console.log("No user data available yet:", userError?.message || userError);
      }
      
      res.json({
        server: "online",
        port: process.env.PORT || 5000,
        environment: process.env.NODE_ENV || "development",
        ...stats,
        connectedAccounts,
        recentPosts: recentPosts.map(post => ({
          id: post.id,
          content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
          platform: post.platform,
          status: post.status,
          platformPostId: post.platformPostId,
          createdAt: post.createdAt,
          metrics: post.metrics ? {
            impressions: post.metrics.impressionCount,
            retweets: post.metrics.retweetCount,
            likes: post.metrics.likeCount,
            replies: post.metrics.replyCount,
            bookmarks: post.metrics.bookmarkCount,
            quotes: post.metrics.quoteCount,
            fetchedAt: post.metrics.fetchedAt
          } : null
        }))
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
      xClientId: !!process.env.X_CLIENT_ID,
      xClientSecret: !!process.env.X_CLIENT_SECRET,
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
      res.status(500).json({ error: "Failed to get logs" });
    }
  });


  // Post to social media (with actual posting to X)
  app.post("/api/post", async (req, res) => {
    try {
      const { content, platform } = req.body;
      
      // For demo, find the most recently connected user account
      // In production, get userId from authenticated session
      
      if (!content || !platform) {
        return res.status(400).json({ error: "Missing required fields: content, platform" });
      }

      // Find the most recent active social account for this platform
      const allAccounts = await storage.getSocialAccounts();
      const platformAccounts = allAccounts.filter((acc: any) => 
        acc.platform === platform && 
        acc.isActive && 
        acc.accessToken
      );
      
      if (platformAccounts.length === 0) {
        return res.status(400).json({ 
          error: `No connected ${platform} account found`,
          suggestion: `Please connect your ${platform} account first via /auth/${platform}/start`
        });
      }
      
      // Use the most recently connected account
      let socialAccount = platformAccounts.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      // Get valid access token (automatically refreshes if needed)
      let validAccessToken: string;
      try {
        const tokenResult = await getValidAccessTokenInternal(socialAccount.userId, platform);
        validAccessToken = tokenResult.accessToken;
        
        if (tokenResult.isRefreshed) {
          console.log("✅ Token refreshed successfully for posting");
          // Re-fetch the updated social account to get the latest token info
          const updatedAccount = await storage.getSocialAccountByPlatform(socialAccount.userId, platform);
          if (updatedAccount) {
            socialAccount = updatedAccount;
          }
        }
      } catch (tokenError: any) {
        console.error("❌ Token validation/refresh failed:", tokenError);
        return res.status(401).json({
          error: "Failed to obtain valid access token",
          suggestion: "Please re-authenticate your account",
          details: tokenError?.message
        });
      }

      // Create post record with pending status - use the actual user ID from social account
      const post = await storage.createPost({
        content,
        platform,
        userId: socialAccount.userId, // Use the actual user ID, not DEMO_USER_ID
        status: "pending"
      });

      try {
        if (platform === "x") {
          const { TwitterOAuth } = await import("./oauth");
          
          // Post tweet using the validated access token
          const tweetData = await TwitterOAuth.postTweet(validAccessToken, content);
          
          // Update post with success status and tweet ID
          await storage.updatePost(post.id, {
            status: "posted",
            platformPostId: tweetData.id,
          });

          res.status(201).json({
            ...post,
            status: "posted",
            platformPostId: tweetData.id,
            tweet: tweetData
          });
        } else {
          // Other platforms not implemented yet
          await storage.updatePost(post.id, {
            status: "failed",
            error: `Platform ${platform} not yet implemented`
          });
          
          res.status(501).json({ 
            error: `Posting to ${platform} is not yet implemented`,
            post: { ...post, status: "failed" }
          });
        }
      } catch (postError: any) {
        console.error("Posting error:", postError);
        
        // Update post with failed status
        await storage.updatePost(post.id, {
          status: "failed",
          error: postError?.message || String(postError)
        });

        res.status(500).json({ 
          error: "Failed to post to social media",
          details: postError?.message || String(postError),
          post: { ...post, status: "failed" }
        });
      }
    } catch (error) {
      console.error("Post creation error:", error);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // Get posts for a user
  app.get("/api/posts/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const posts = await storage.getPostsByUser(userId);
      res.json(posts);
    } catch (error) {
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
        acc.platform === "x" && 
        acc.isActive && 
        acc.accessToken
      );
      
      if (xAccounts.length === 0) {
        return res.status(400).json({ 
          error: "No connected X account found",
          suggestion: "Please connect your X account first via /auth/x/start"
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
          suggestion: "Connect via /auth/x/start"
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

  // Get user profile from X API
  app.get("/api/user/profile", getUserProfile);

  // Test endpoint for API verification
  app.get("/api/test", (req, res) => {
    res.json({ 
      message: "Mirancourt Social API is working",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      endpoints: {
        oauth: {
          start: "GET /auth/x/start",
          callback: "GET /auth/x/callback"
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

  const httpServer = createServer(app);
  return httpServer;
}
