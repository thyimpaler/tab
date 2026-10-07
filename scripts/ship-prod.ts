// Ships production (devnet): migrate Neon, push DATABASE_URL to Vercel, deploy --prod.
// Reads NEON_DATABASE_URL from TAB/.env. Never prints the URL.
// Usage (from TAB): npx tsx scripts/ship-prod.ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import { migrate } from "../src/server/migrate.ts";

const line = readFileSync(".env", "utf8").split(/\r?\n/).find((l) => l.startsWith("NEON_DATABASE_URL="));
if (!line) throw new Error("NEON_DATABASE_URL missing in .env");
const url = line.slice("NEON_DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
if (!/^postgres(ql)?:\/\/.+-pooler\./.test(url)) throw new Error("NEON_DATABASE_URL must be the pooled Neon URL");

console.log("1/3 migrating Neon…");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
await migrate(pool);
const t = await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
console.log(`   tables in public schema: ${t.rows[0].n}`);
await pool.end();

console.log("2/3 setting DATABASE_URL on Vercel (production)…");
try { execSync("npx vercel env rm DATABASE_URL production --yes", { stdio: "ignore" }); } catch {}
execSync("npx vercel env add DATABASE_URL production", { input: url, stdio: ["pipe", "ignore", "inherit"] });
console.log("   set DATABASE_URL");

console.log("3/3 deploying production…");
const out = execSync("npx vercel deploy --prod --yes", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const ready = /Deployment (\S+) ready/.exec(out)?.[1] ?? out.trim().split("\n").pop();
console.log(`   ${ready}`);
console.log("SHIP_DONE");
