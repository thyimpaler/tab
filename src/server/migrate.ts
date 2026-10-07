import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

const DIR = join(import.meta.dirname, "..", "..", "db", "migrations");

/** Applies db/migrations/*.sql in order, once each. */
export async function migrate(pool: pg.Pool, log = console.log) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await pool.query(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name));
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(join(DIR, file), "utf8"));
      await client.query(`INSERT INTO schema_migrations(name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      log(`applied ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const { db, closeDb } = await import("./db.ts");
  await migrate(db());
  await closeDb();
  console.log("migrations up to date");
}
