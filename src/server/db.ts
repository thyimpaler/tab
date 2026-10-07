import pg from "pg";
import { config } from "./config.ts";

// bigint columns come back as strings by default; parse to native bigint (no floats for money).
pg.types.setTypeParser(20, (v) => BigInt(v));

let pool: pg.Pool | undefined;

export function db(): pg.Pool {
  if (!pool) {
    const url = config().databaseUrl;
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

export type Tx = pg.PoolClient;

export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
