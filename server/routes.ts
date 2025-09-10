import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cors from "cors";

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

  // API status endpoint
  app.get("/api/status", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json({
        server: "online",
        port: process.env.PORT || 5000,
        environment: process.env.NODE_ENV || "development",
        ...stats,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get server status" });
    }
  });

  // Environment configuration endpoint
  app.get("/api/config", (req, res) => {
    const config = {
      port: process.env.PORT || 5000,
      corsOrigin: process.env.CORS_ORIGIN || "*",
      xApiKey: !!process.env.X_API_KEY,
      xApiSecret: !!process.env.X_API_SECRET,
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

  // X (Twitter) authentication placeholder route
  app.post("/auth/x", (req, res) => {
    const { X_API_KEY, X_API_SECRET } = process.env;
    
    if (!X_API_KEY || !X_API_SECRET) {
      return res.status(500).json({ 
        error: "X API credentials not configured",
        message: "Please set X_API_KEY and X_API_SECRET in your environment variables"
      });
    }

    // Placeholder for X OAuth flow
    res.status(501).json({ 
      message: "X authentication not yet implemented",
      todo: "Implement OAuth 2.0 flow for X (Twitter) API"
    });
  });

  // Social media posting endpoints (placeholders)
  app.post("/api/post", async (req, res) => {
    try {
      const { content, platform, userId } = req.body;
      
      if (!content || !platform || !userId) {
        return res.status(400).json({ error: "Missing required fields: content, platform, userId" });
      }

      const post = await storage.createPost({
        content,
        platform,
        userId,
        status: "pending"
      });

      res.status(201).json(post);
    } catch (error) {
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

  // Test endpoint for API verification
  app.get("/api/test", (req, res) => {
    res.json({ 
      message: "Mirancourt Social API is working",
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
