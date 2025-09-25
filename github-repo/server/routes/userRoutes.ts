import express from "express";
import { getUserProfile } from "../controllers/userController";
import { postTweet } from "../controllers/postController";

const router = express.Router();

router.get("/profile", getUserProfile);
router.post("/tweet", postTweet);

export default router;