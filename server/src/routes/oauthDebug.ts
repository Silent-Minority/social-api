import { Router } from "express";

export const oauthDebugRouter = Router();

oauthDebugRouter.get("/oauth/debug", (req, res) => {
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  const isLocal = /(^localhost:?\d*$)|(^127\.0\.0\.1:?\d*$)|\.replit\.dev$/i.test(host || "");
  const effectiveRedirect = (isLocal && process.env.X_REDIRECT_URI_LOCAL) ? process.env.X_REDIRECT_URI_LOCAL : process.env.X_REDIRECT_URI;
  res.json({
    xClientId: !!process.env.X_CLIENT_ID,
    xClientSecret: !!process.env.X_CLIENT_SECRET,
    xRedirectUri: !!process.env.X_REDIRECT_URI,
    xScopes: !!process.env.X_SCOPES,
    cookieSecret: !!process.env.COOKIE_SECRET,
    jwtSecret: !!process.env.JWT_SECRET,
    db: !!process.env.DATABASE_URL,
    host,
    isLocal,
    effectiveRedirectUri: effectiveRedirect || null,
  });
});
