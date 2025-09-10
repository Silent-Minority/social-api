import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

sqlite3.verbose();

export type DB = Database<sqlite3.Database, sqlite3.Statement>;

let dbPromise: Promise<DB> | null = null;

export async function getDb(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = open({
      filename: "./data.db",
      driver: sqlite3.Database
    });
  }
  return dbPromise;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      x_user_id TEXT UNIQUE,
      username TEXT,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      x_user_id TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      x_user_id TEXT,
      tweet_id TEXT UNIQUE,
      text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_id TEXT,
      like_count INTEGER,
      retweet_count INTEGER,
      reply_count INTEGER,
      quote_count INTEGER,
      bookmark_count INTEGER,
      impression_count INTEGER,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
