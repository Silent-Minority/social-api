import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cors from "cors";
import { DEMO_USER_ID } from "./auth";

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

      // Check if token is expired and needs refresh
      if (socialAccount.tokenExpiresAt && socialAccount.tokenExpiresAt <= new Date()) {
        if (!socialAccount.refreshToken) {
          return res.status(401).json({
            error: "Access token expired and no refresh token available",
            suggestion: "Please re-authenticate your account"
          });
        }
        
        // Refresh the access token
        const { X_CLIENT_ID: clientId, X_CLIENT_SECRET: clientSecret } = process.env;
        if (!clientId || !clientSecret) {
          return res.status(500).json({ error: "OAuth 2.0 credentials not configured" });
        }
        
        try {
          const { TwitterOAuth, calculateTokenExpiration } = await import("./oauth");
          const refreshedTokens = await TwitterOAuth.refreshAccessToken(
            socialAccount.refreshToken,
            clientId,
            clientSecret
          );
          
          // Update the social account with new tokens
          const newExpiresAt = calculateTokenExpiration(refreshedTokens.expires_in);
          await storage.updateSocialAccount(socialAccount.id, {
            accessToken: refreshedTokens.access_token,
            refreshToken: refreshedTokens.refresh_token || socialAccount.refreshToken,
            tokenExpiresAt: newExpiresAt,
            scope: refreshedTokens.scope
          });
          
          // Update the local socialAccount object for this request
          socialAccount.accessToken = refreshedTokens.access_token;
          socialAccount.refreshToken = refreshedTokens.refresh_token || socialAccount.refreshToken;
          socialAccount.tokenExpiresAt = newExpiresAt;
          
          console.log("Successfully refreshed access token for user:", socialAccount.userId);
        } catch (refreshError: any) {
          console.error("Token refresh failed:", refreshError);
          return res.status(401).json({
            error: "Failed to refresh access token",
            suggestion: "Please re-authenticate your account",
            details: refreshError?.message
          });
        }
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
          
          // Post tweet - accessToken is guaranteed to exist at this point
          if (!socialAccount.accessToken) {
            throw new Error("Access token not available");
          }
          const tweetData = await TwitterOAuth.postTweet(socialAccount.accessToken, content);
          
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

      // Check token expiration for metrics fetching and refresh if needed
      if (socialAccount.tokenExpiresAt && socialAccount.tokenExpiresAt <= new Date()) {
        if (!socialAccount.refreshToken) {
          return res.status(401).json({
            error: "Access token expired and no refresh token available",
            suggestion: "Please re-authenticate your X account"
          });
        }
        
        // Refresh the access token
        const { X_CLIENT_ID: clientId, X_CLIENT_SECRET: clientSecret } = process.env;
        if (!clientId || !clientSecret) {
          return res.status(500).json({ error: "OAuth 2.0 credentials not configured" });
        }
        
        try {
          const { TwitterOAuth, calculateTokenExpiration } = await import("./oauth");
          const refreshedTokens = await TwitterOAuth.refreshAccessToken(
            socialAccount.refreshToken,
            clientId,
            clientSecret
          );
          
          // Update the social account with new tokens
          const newExpiresAt = calculateTokenExpiration(refreshedTokens.expires_in);
          await storage.updateSocialAccount(socialAccount.id, {
            accessToken: refreshedTokens.access_token,
            refreshToken: refreshedTokens.refresh_token || socialAccount.refreshToken,
            tokenExpiresAt: newExpiresAt,
            scope: refreshedTokens.scope
          });
          
          // Update the local socialAccount object for this request
          socialAccount.accessToken = refreshedTokens.access_token;
          socialAccount.refreshToken = refreshedTokens.refresh_token || socialAccount.refreshToken;
          socialAccount.tokenExpiresAt = newExpiresAt;
          
          console.log("Successfully refreshed access token for metrics:", socialAccount.userId);
        } catch (refreshError: any) {
          console.error("Metrics token refresh failed:", refreshError);
          return res.status(401).json({
            error: "Failed to refresh access token for metrics",
            suggestion: "Please re-authenticate your X account",
            details: refreshError?.message
          });
        }
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
        // Fetch metrics from X API - accessToken is guaranteed to exist at this point
        if (!socialAccount.accessToken) {
          throw new Error("Access token not available for metrics fetch");
        }
        const metricsData = await TwitterOAuth.fetchTweetMetrics(
          socialAccount.accessToken,
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
      res.json(accounts);
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
        metrics: "POST /api/metrics/fetch",
        accounts: "GET /api/accounts/:userId",
        posts: "GET /api/posts/:userId",
        status: "GET /api/status (with accounts and posts)",
        health: "GET /health"
      }
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
