/**
 * MCP server implementation with vcad tools.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Engine } from "@vcad/engine";
import { createCadDocument, createCadDocumentSchema } from "./tools/create.js";
import { exportCad, exportCadSchema } from "./tools/export.js";
import { inspectCad, inspectCadSchema } from "./tools/inspect.js";

export async function createServer(): Promise<Server> {
  // Initialize the WASM engine
  const engine = await Engine.init();

  const server = new Server(
    {
      name: "vcad",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "create_cad_document",
        description:
          "Create a CAD document from structured geometry input. Returns an IR document that can be exported or inspected.\n\n" +
          "Primitive origins:\n" +
          "- Cube: corner at (0,0,0), extends to (size.x, size.y, size.z)\n" +
          "- Cylinder: base center at (0,0,0), height along +Z\n" +
          "- Sphere: center at (0,0,0)\n" +
          "- Cone: base center at (0,0,0), height along +Z\n\n" +
          "Positioning:\n" +
          "- Absolute: {x: 25, y: 15, z: 0}\n" +
          "- Named: 'center', 'top-center', 'bottom-center'\n" +
          "- Percentage: {x: '50%', y: '50%'}\n\n" +
          "Hole operation: {type: 'hole', diameter: 3, at: 'center'} creates a vertical through-hole. " +
          "Omit 'depth' for through-hole, or specify depth in mm for blind hole.",
        inputSchema: createCadDocumentSchema,
      },
      {
        name: "export_cad",
        description:
          "Export a CAD document to a file. Supports STL (3D printing) and GLB (visualization) formats. Format is determined by file extension.",
        inputSchema: exportCadSchema,
      },
      {
        name: "inspect_cad",
        description:
          "Inspect a CAD document to get geometry properties: volume, surface area, bounding box, center of mass, and triangle count.",
        inputSchema: inspectCadSchema,
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "create_cad_document":
          return createCadDocument(args);

        case "export_cad":
          return exportCad(args, engine);

        case "inspect_cad":
          return inspectCad(args, engine);

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
