import express from "express";
import { postTweet } from "../controllers/postController";

const router = express.Router();
router.post("/", postTweet);

export default router;