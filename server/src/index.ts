import express from 'express';
import authRoutes from './auth';

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Auth routes
app.use(authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'simplified-oauth-server'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Simplified OAuth Server</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; 
            max-width: 600px; 
            margin: 50px auto; 
            padding: 20px; 
            line-height: 1.6;
          }
          .header { text-align: center; margin-bottom: 40px; }
          .button { 
            display: inline-block; 
            background: #1d9bf0; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 500;
          }
          .button:hover { background: #1a8cd8; }
          .endpoint { 
            background: #f8f9fa; 
            border-left: 4px solid #1d9bf0; 
            padding: 12px; 
            margin: 8px 0; 
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🐦 Simplified OAuth Server</h1>
          <p>Clean OAuth 2.0 PKCE implementation for Twitter</p>
        </div>
        
        <h2>🚀 Quick Start</h2>
        <p>Connect your Twitter account to get started:</p>
        <a href="/auth/x/start" class="button">Connect Twitter Account</a>
        
        <h2>📋 Available Endpoints</h2>
        <div class="endpoint">GET /auth/x/start - Start Twitter OAuth flow</div>
        <div class="endpoint">GET /auth/x/callback - OAuth callback handler</div>
        <div class="endpoint">GET /health - Server health check</div>
        
        <h2>🔧 Environment Setup</h2>
        <p>Required Replit Secrets:</p>
        <ul>
          <li><code>X_CLIENT_ID</code> - Your Twitter App Client ID</li>
          <li><code>X_CLIENT_SECRET</code> - Your Twitter App Client Secret</li>
          <li><code>DATABASE_URL</code> - PostgreSQL connection string</li>
        </ul>
      </body>
    </html>
  `);
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Simplified OAuth server running on port ${PORT}`);
  console.log(`🔗 Visit http://localhost:${PORT} to start`);
});