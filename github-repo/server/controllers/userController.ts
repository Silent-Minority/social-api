import { resolveAccountAndToken } from "../services/userService.js";

export async function getUserProfile(req: any, res: any, next: any) {
  try {
    const { account, access } = await resolveAccountAndToken("default");

    const url = `https://api.x.com/2/users/${account.accountId}?user.fields=profile_image_url,description,public_metrics`;

    const r = await fetch(url, {
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