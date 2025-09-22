import { resolveAccountAndToken } from "../services/userService";
import { storage } from "../storage";

export async function postTweet(req: any, res: any, next: any) {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing tweet text" });
    }

    const { account, access } = await resolveAccountAndToken("default");

    const r = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
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
      userId: account.userId,
      content: text,
      platform: "x",
      platformPostId: data.data?.id,
      status: "posted",
      error: null
    });

    // Return enriched response with local post data and X API response
    return res.status(201).json({
      id: post.id,
      userId: post.userId,
      content: post.content,
      platform: post.platform,
      platformPostId: post.platformPostId,
      status: post.status,
      error: post.error,
      createdAt: post.createdAt,
      tweet: data.data // Original X API response
    });
  } catch (err: any) {
    if (err.message.includes("No connected X account")) {
      return res.status(400).json({
        error: "No connected X account found",
        suggestion: "Connect via /auth/x/start"
      });
    }
    return next(err);
  }
}