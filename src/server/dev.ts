// Local API server. Loads TAB/.env, runs migrations, serves /api on PORT.
import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { join } from "node:path";

const envFile = join(import.meta.dirname, "..", "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { app } = await import("./app.ts");
const { db } = await import("./db.ts");
const { migrate } = await import("./migrate.ts");
await migrate(db());

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`TAB api on http://localhost:${port}/api`));
