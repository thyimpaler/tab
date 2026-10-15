#!/usr/bin/env node
// stdio entry point:  TAB_CREDENTIAL=tab_test_… npx @tabpaysi/mcp
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTabMcp } from "./server.js";

const credential = process.env.TAB_CREDENTIAL?.trim();
if (!credential) {
  console.error("TAB MCP: set TAB_CREDENTIAL to the tab key shown when you opened the tab.");
  process.exit(1);
}

try {
  const server = createTabMcp({
    credential,
    apiUrl: process.env.TAB_API_URL,
    marketUrl: process.env.TAB_MARKET_URL,
    maxPayment: process.env.TAB_MAX_PAYMENT,
  });
  await server.connect(new StdioServerTransport());
} catch (e) {
  // Never print the credential.
  console.error("TAB MCP failed to start:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
}
