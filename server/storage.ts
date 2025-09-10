import { type User, type InsertUser, type SocialAccount, type InsertSocialAccount, type Post, type InsertPost, type ApiLog, type InsertApiLog } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Social account operations
  getSocialAccount(id: string): Promise<SocialAccount | undefined>;
  getSocialAccountsByUser(userId: string): Promise<SocialAccount[]>;
  getSocialAccountByPlatform(userId: string, platform: string): Promise<SocialAccount | undefined>;
  createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount>;
  updateSocialAccount(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount | undefined>;

  // Post operations
  getPost(id: string): Promise<Post | undefined>;
  getPostsByUser(userId: string): Promise<Post[]>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: string, updates: Partial<Post>): Promise<Post | undefined>;

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

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private socialAccounts: Map<string, SocialAccount>;
  private posts: Map<string, Post>;
  private apiLogs: Map<string, ApiLog>;

  constructor() {
    this.users = new Map();
    this.socialAccounts = new Map();
    this.posts = new Map();
    this.apiLogs = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getSocialAccount(id: string): Promise<SocialAccount | undefined> {
    return this.socialAccounts.get(id);
  }

  async getSocialAccountsByUser(userId: string): Promise<SocialAccount[]> {
    return Array.from(this.socialAccounts.values()).filter(
      (account) => account.userId === userId,
    );
  }

  async getSocialAccountByPlatform(userId: string, platform: string): Promise<SocialAccount | undefined> {
    return Array.from(this.socialAccounts.values()).find(
      (account) => account.userId === userId && account.platform === platform,
    );
  }

  async createSocialAccount(insertAccount: InsertSocialAccount): Promise<SocialAccount> {
    const id = randomUUID();
    const account: SocialAccount = { 
      ...insertAccount, 
      id,
      createdAt: new Date(),
    };
    this.socialAccounts.set(id, account);
    return account;
  }

  async updateSocialAccount(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount | undefined> {
    const account = this.socialAccounts.get(id);
    if (!account) return undefined;
    
    const updatedAccount = { ...account, ...updates };
    this.socialAccounts.set(id, updatedAccount);
    return updatedAccount;
  }

  async getPost(id: string): Promise<Post | undefined> {
    return this.posts.get(id);
  }

  async getPostsByUser(userId: string): Promise<Post[]> {
    return Array.from(this.posts.values()).filter(
      (post) => post.userId === userId,
    );
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const id = randomUUID();
    const post: Post = { 
      ...insertPost, 
      id,
      createdAt: new Date(),
    };
    this.posts.set(id, post);
    return post;
  }

  async updatePost(id: string, updates: Partial<Post>): Promise<Post | undefined> {
    const post = this.posts.get(id);
    if (!post) return undefined;
    
    const updatedPost = { ...post, ...updates };
    this.posts.set(id, updatedPost);
    return updatedPost;
  }

  async getRecentLogs(limit: number = 50): Promise<ApiLog[]> {
    const logs = Array.from(this.apiLogs.values())
      .sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0))
      .slice(0, limit);
    return logs;
  }

  async createApiLog(insertLog: InsertApiLog): Promise<ApiLog> {
    const id = randomUUID();
    const log: ApiLog = { 
      ...insertLog, 
      id,
      timestamp: new Date(),
    };
    this.apiLogs.set(id, log);
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
    
    const requestsToday = Array.from(this.apiLogs.values()).filter(
      log => log.timestamp && log.timestamp >= today
    ).length;

    return {
      totalRoutes: 8,
      requestsToday,
      activeConnections: 1,
      serverStatus: 'online',
    };
  }
}

export const storage = new MemStorage();
