import { Router } from "express";
export const oauthDebug = Router();

oauthDebug.get("/oauth/debug", async (_req, res) => {
  const haveDB     = !!process.env.DATABASE_URL;
  const haveCID    = !!process.env.X_CLIENT_ID;
  const haveCSEC   = !!process.env.X_CLIENT_SECRET;
  const haveURI    = !!process.env.X_REDIRECT_URI;
  const haveScopes = !!process.env.X_SCOPES;
  const haveCookie = !!process.env.COOKIE_SECRET;
  const haveJWT    = !!process.env.JWT_SECRET;

  res.json({
    xClientId:     haveCID,
    xClientSecret: haveCSEC,
    xRedirectUri:  haveURI,
    xScopes:       haveScopes,
    cookieSecret:  haveCookie,
    jwtSecret:     haveJWT,
    db:            haveDB
  });
});
