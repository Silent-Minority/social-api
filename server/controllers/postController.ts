import { resolveAccountAndToken } from "../services/userService";
import { storage } from "../storage";

export async function postTweet(req: any, res: any, next: any) {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing tweet text" });
    }

    const { userId, accountId, accessToken } = await resolveAccountAndToken("default");
    
    // Get the full account object for additional data needed
    const account = await storage.getSocialAccounts().then(accounts => 
      accounts.find(acc => acc.userId === userId && acc.accountId === accountId)
    );

    const r = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(502).json({
        error: "X API error",
        status: r.status,
        details: data
      });
    }

    // Save successful post to database
    const post = await storage.createPost({
      userId: userId,
      accountId: account?.id || accountId, // Link to the specific social account
      content: text,
      platform: "x",
      platformPostId: data.data?.id,
      status: "posted",
      error: null
    });

    // Return response in expected format: {"id": "tweet_id", "url": "https://twitter.com/username/status/tweet_id"}
    const tweetId = data.data?.id;
    // ✅ FIXED: Use stored accountUsername without hardcoded fallback to avoid security risk
    if (!account || !account.accountUsername) {
      return res.status(500).json({
        error: "Account configuration error",
        message: "No username stored for connected account"
      });
    }
    const username = account.accountUsername;
    
    return res.status(200).json({
      id: tweetId,
      url: `https://twitter.com/${username}/status/${tweetId}`
    });
  } catch (err: any) {
    if (err.message.includes("No connected X account")) {
      return res.status(400).json({
        error: "No connected X account found",
        suggestion: "Connect via /auth/twitter/start"
      });
    }
    return next(err);
  }
}