// Starts a real Postgres (embedded-postgres) for the test run, so row locks are real.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

let pg: EmbeddedPostgres | undefined;
let dir = "";

export async function setup(project: TestProject) {
  dir = mkdtempSync(join(tmpdir(), "tab-pg-"));
  const port = 54000 + Math.floor(Math.random() * 1000);
  pg = new EmbeddedPostgres({ databaseDir: dir, user: "tab", password: "tab", port, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("tab_test");
  project.provide("databaseUrl", `postgres://tab:tab@127.0.0.1:${port}/tab_test`);
}

export async function teardown() {
  await pg?.stop();
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

declare module "vitest" {
  export interface ProvidedContext { databaseUrl: string }
}
