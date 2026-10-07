// Local Postgres for dev (no Docker needed). Data in TAB/.data/pg, port 54329.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "..", ".data", "pg");
const fresh = !existsSync(join(dir, "PG_VERSION"));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "tab", password: "tab", port: 54329, persistent: true, onLog: () => {} });
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("tab");
console.log("dev postgres on 127.0.0.1:54329 (db: tab). Ctrl+C to stop.");
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
