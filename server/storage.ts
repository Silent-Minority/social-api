import { 
  type User, type InsertUser, 
  type SocialAccount, type InsertSocialAccount, 
  type Post, type InsertPost, 
  type ApiLog, type InsertApiLog,
  type TweetMetrics, type InsertTweetMetrics,
  type OauthState, type InsertOauthState,
  users, socialAccounts, posts, apiLogs, tweetMetrics, oauthStates
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Social account operations
  getSocialAccount(id: string): Promise<SocialAccount | undefined>;
  getSocialAccounts(): Promise<SocialAccount[]>;
  getSocialAccountsByUser(userId: string): Promise<SocialAccount[]>;
  getSocialAccountByPlatform(userId: string, platform: string): Promise<SocialAccount | undefined>;
  createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount>;
  updateSocialAccount(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount | undefined>;

  // Post operations
  getPost(id: string): Promise<Post | undefined>;
  getPostsByUser(userId: string): Promise<Post[]>;
  getPostsWithMetrics(userId: string, limit?: number): Promise<Array<Post & { metrics?: TweetMetrics }>>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: string, updates: Partial<Post>): Promise<Post | undefined>;

  // OAuth state operations
  createOauthState(state: InsertOauthState): Promise<OauthState>;
  getOauthState(state: string): Promise<OauthState | undefined>;
  deleteOauthState(state: string): Promise<void>;

  // Tweet metrics operations
  createTweetMetrics(metrics: InsertTweetMetrics): Promise<TweetMetrics>;
  updateTweetMetrics(postId: string, metrics: Partial<TweetMetrics>): Promise<TweetMetrics | undefined>;
  getTweetMetricsByPostIds(postIds: string[]): Promise<TweetMetrics[]>;

  // API log operations
  getRecentLogs(limit?: number): Promise<ApiLog[]>;
  createApiLog(log: InsertApiLog): Promise<ApiLog>;

  // Dashboard stats
  getStats(): Promise<{
    totalRoutes: number;
    requestsToday: number;
    activeConnections: number;
    serverStatus: string;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getSocialAccount(id: string): Promise<SocialAccount | undefined> {
    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    return account || undefined;
  }

  async getSocialAccounts(): Promise<SocialAccount[]> {
    return await db.select().from(socialAccounts).orderBy(desc(socialAccounts.createdAt));
  }

  async getSocialAccountsByUser(userId: string): Promise<SocialAccount[]> {
    return await db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId));
  }

  async getSocialAccountByPlatform(userId: string, platform: string): Promise<SocialAccount | undefined> {
    const [account] = await db.select().from(socialAccounts)
      .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.platform, platform)));
    return account || undefined;
  }

  async createSocialAccount(insertAccount: InsertSocialAccount): Promise<SocialAccount> {
    const [account] = await db.insert(socialAccounts).values(insertAccount).returning();
    return account;
  }

  async updateSocialAccount(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount | undefined> {
    const [account] = await db.update(socialAccounts)
      .set(updates)
      .where(eq(socialAccounts.id, id))
      .returning();
    return account || undefined;
  }

  async getPost(id: string): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post || undefined;
  }

  async getPostsByUser(userId: string): Promise<Post[]> {
    return await db.select().from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
  }

  async getPostsWithMetrics(userId: string, limit: number = 10): Promise<Array<Post & { metrics?: TweetMetrics }>> {
    const userPosts = await db.select().from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    const postsWithMetrics = await Promise.all(
      userPosts.map(async (post) => {
        const [metrics] = await db.select().from(tweetMetrics)
          .where(eq(tweetMetrics.postId, post.id))
          .orderBy(desc(tweetMetrics.fetchedAt))
          .limit(1);
        return { ...post, metrics: metrics || undefined };
      })
    );

    return postsWithMetrics;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values(insertPost).returning();
    return post;
  }

  async updatePost(id: string, updates: Partial<Post>): Promise<Post | undefined> {
    const [post] = await db.update(posts)
      .set(updates)
      .where(eq(posts.id, id))
      .returning();
    return post || undefined;
  }

  async createOauthState(insertState: InsertOauthState): Promise<OauthState> {
    const [state] = await db.insert(oauthStates).values(insertState).returning();
    return state;
  }

  async getOauthState(stateValue: string): Promise<OauthState | undefined> {
    const [state] = await db.select().from(oauthStates)
      .where(eq(oauthStates.state, stateValue));
    return state || undefined;
  }

  async deleteOauthState(stateValue: string): Promise<void> {
    await db.delete(oauthStates).where(eq(oauthStates.state, stateValue));
  }

  async createTweetMetrics(insertMetrics: InsertTweetMetrics): Promise<TweetMetrics> {
    const [metrics] = await db.insert(tweetMetrics).values(insertMetrics).returning();
    return metrics;
  }

  async updateTweetMetrics(postId: string, updates: Partial<TweetMetrics>): Promise<TweetMetrics | undefined> {
    const [metrics] = await db.update(tweetMetrics)
      .set(updates)
      .where(eq(tweetMetrics.postId, postId))
      .returning();
    return metrics || undefined;
  }

  async getTweetMetricsByPostIds(postIds: string[]): Promise<TweetMetrics[]> {
    if (postIds.length === 0) return [];
    return await db.select().from(tweetMetrics)
      .where(eq(tweetMetrics.postId, postIds[0])); // Simple implementation, can be enhanced
  }

  async getRecentLogs(limit: number = 50): Promise<ApiLog[]> {
    return await db.select().from(apiLogs)
      .orderBy(desc(apiLogs.timestamp))
      .limit(limit);
  }

  async createApiLog(insertLog: InsertApiLog): Promise<ApiLog> {
    const [log] = await db.insert(apiLogs).values(insertLog).returning();
    return log;
  }

  async getStats(): Promise<{
    totalRoutes: number;
    requestsToday: number;
    activeConnections: number;
    serverStatus: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const requestsToday = await db.select().from(apiLogs)
      .where(gte(apiLogs.timestamp, today));

    return {
      totalRoutes: 10, // Updated to reflect new routes
      requestsToday: requestsToday.length,
      activeConnections: 1,
      serverStatus: 'online',
    };
  }
}

export const storage = new DatabaseStorage();
