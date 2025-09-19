import { resolveAccountAndToken } from "../services/userService";

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

    return res.status(201).json(data);
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