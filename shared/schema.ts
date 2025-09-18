import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const socialAccounts = pgTable("social_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  platform: text("platform").notNull(), // 'x', 'facebook', 'instagram', etc.
  accountId: text("account_id").notNull(),
  accountUsername: text("account_username"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  scope: text("scope"), // OAuth scopes granted
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const posts = pgTable("posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  platform: text("platform").notNull(),
  platformPostId: text("platform_post_id"),
  status: text("status").notNull().default('pending'), // 'pending', 'posted', 'failed'
  error: text("error"), // Error message if posting failed
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const tweetMetrics = pgTable("tweet_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id),
  tweetId: text("tweet_id").notNull(),
  impressionCount: integer("impression_count").default(0),
  retweetCount: integer("retweet_count").default(0),
  likeCount: integer("like_count").default(0),
  replyCount: integer("reply_count").default(0),
  bookmarkCount: integer("bookmark_count").default(0),
  quoteCount: integer("quote_count").default(0),
  fetchedAt: timestamp("fetched_at").default(sql`now()`),
});

export const oauthStates = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: text("state").notNull().unique(),
  codeVerifier: text("code_verifier").notNull(),
  platform: text("platform").notNull(),
  userId: varchar("user_id").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const apiLogs = pgTable("api_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  method: text("method").notNull(),
  path: text("path").notNull(),
  statusCode: integer("status_code").notNull(),
  responseTime: integer("response_time"), // in milliseconds
  timestamp: timestamp("timestamp").default(sql`now()`),
});

export const twitterTokens = pgTable("twitter_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scope: text("scope"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSocialAccountSchema = createInsertSchema(socialAccounts).omit({
  id: true,
  createdAt: true,
});

export const insertPostSchema = createInsertSchema(posts).omit({
  id: true,
  createdAt: true,
  platformPostId: true,
});

export const insertApiLogSchema = createInsertSchema(apiLogs).omit({
  id: true,
  timestamp: true,
});

export const insertTweetMetricsSchema = createInsertSchema(tweetMetrics).omit({
  id: true,
  fetchedAt: true,
});

export const insertOauthStateSchema = createInsertSchema(oauthStates).omit({
  id: true,
  createdAt: true,
});

export const insertTwitterTokensSchema = createInsertSchema(twitterTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertSocialAccount = z.infer<typeof insertSocialAccountSchema>;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type ApiLog = typeof apiLogs.$inferSelect;
export type InsertTweetMetrics = z.infer<typeof insertTweetMetricsSchema>;
export type TweetMetrics = typeof tweetMetrics.$inferSelect;
export type InsertOauthState = z.infer<typeof insertOauthStateSchema>;
export type OauthState = typeof oauthStates.$inferSelect;
export type InsertTwitterTokens = z.infer<typeof insertTwitterTokensSchema>;
export type TwitterTokens = typeof twitterTokens.$inferSelect;

// API Response Types
export interface ServerConfig {
  port: string;
  corsOrigin: string;
  xClientId: boolean;
  xClientSecret: boolean;
  jwtSecret: string;
}

export interface ServerStatus {
  server: string;
  port: string;
  environment: string;
  totalRoutes: number;
  requestsToday: number;
  activeConnections: number;
  serverStatus: string;
}
