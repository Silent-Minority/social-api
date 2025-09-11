import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import { twitterTokens, type InsertTwitterTokens, type TwitterTokens } from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool });

// Save or update Twitter tokens for a user
export async function saveTokens(tokens: InsertTwitterTokens): Promise<TwitterTokens> {
  // First, try to find existing tokens for this user
  const existingTokens = await db
    .select()
    .from(twitterTokens)
    .where(eq(twitterTokens.userId, tokens.userId))
    .limit(1);

  if (existingTokens.length > 0) {
    // Update existing tokens
    const [updatedTokens] = await db
      .update(twitterTokens)
      .set({
        ...tokens,
        updatedAt: new Date(),
      })
      .where(eq(twitterTokens.userId, tokens.userId))
      .returning();
    
    return updatedTokens;
  } else {
    // Insert new tokens
    const [newTokens] = await db
      .insert(twitterTokens)
      .values(tokens)
      .returning();
    
    return newTokens;
  }
}

// Get Twitter tokens for a user
export async function getTokens(userId: string): Promise<TwitterTokens | null> {
  const tokens = await db
    .select()
    .from(twitterTokens)
    .where(eq(twitterTokens.userId, userId))
    .limit(1);
  
  return tokens[0] || null;
}

// Delete Twitter tokens for a user
export async function deleteTokens(userId: string): Promise<void> {
  await db
    .delete(twitterTokens)
    .where(eq(twitterTokens.userId, userId));
}