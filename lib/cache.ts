import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "cache.db");
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const fs = require("fs");
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);

    // Create cache table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS holdings_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      )
    `);

    console.log(`SQLite cache initialized at: ${DB_PATH}`);
  }
  return db;
}

export interface CacheEntry {
  data: any;
  fetched_at: number;
}

export function getCachedHoldings(): CacheEntry | null {
  try {
    const database = getDb();
    const row = database.prepare("SELECT data, fetched_at FROM holdings_cache WHERE id = 1").get() as { data: string; fetched_at: number } | undefined;

    if (!row) {
      console.log("No cached holdings found in database");
      return null;
    }

    const currentTime = Date.now();
    const age = currentTime - row.fetched_at;

    if (age > CACHE_DURATION_MS) {
      console.log(`Cache expired (age: ${Math.round(age / 1000 / 60)} minutes, max: ${CACHE_DURATION_MS / 1000 / 60} minutes)`);
      return null;
    }

    console.log(`Using cached holdings (age: ${Math.round(age / 1000 / 60)} minutes)`);
    return {
      data: JSON.parse(row.data),
      fetched_at: row.fetched_at
    };
  } catch (error) {
    console.error("Error reading from cache:", error);
    return null;
  }
}

export function setCachedHoldings(data: any): void {
  try {
    const database = getDb();
    const fetchedAt = Date.now();

    // show frontend that its cached
    database.prepare(`
      INSERT INTO holdings_cache (id, data, fetched_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        fetched_at = excluded.fetched_at
    `).run(JSON.stringify(data), fetchedAt);

    console.log("Holdings data cached successfully");
  } catch (error) {
    console.error("Error writing to cache:", error);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log("Database connection closed");
  }
}

export function clearCache(): void {
  try {
    const database = getDb();
    database.prepare("DELETE FROM holdings_cache").run();
    console.log("Cache cleared successfully");
  } catch (error) {
    console.error("Error clearing cache:", error);
  }
}


// Handle graceful shutdown
process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDb();
  process.exit(0);
});
