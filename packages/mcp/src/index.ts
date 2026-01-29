#!/usr/bin/env node
/**
 * @vcad/mcp — MCP server for CAD operations.
 *
 * Provides tools for creating, exporting, and inspecting CAD geometry
 * via the Model Context Protocol.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
