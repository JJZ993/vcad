/**
 * export_cad tool — export IR document to file.
 */

import type { Document } from "@vcad/ir";
import type { Engine } from "@vcad/engine";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { toStlBytes } from "../export/stl.js";
import { toGlbBytes } from "../export/glb.js";

interface ExportInput {
  ir: Document;
  filename: string;
}

export const exportCadSchema = {
  type: "object" as const,
  properties: {
    ir: {
      type: "object" as const,
      description: "IR document from create_cad_document",
    },
    filename: {
      type: "string" as const,
      description: "Output filename with extension (.stl or .glb)",
    },
  },
  required: ["ir", "filename"],
};

export function exportCad(
  input: unknown,
  engine: Engine,
): { content: Array<{ type: "text"; text: string }> } {
  const { ir, filename } = input as ExportInput;

  // Evaluate the document to get meshes
  const scene = engine.evaluate(ir);

  if (scene.parts.length === 0) {
    throw new Error("Document has no parts to export");
  }

  // Determine format from extension
  const ext = filename.toLowerCase().split(".").pop();
  let bytes: Uint8Array;

  switch (ext) {
    case "stl":
      bytes = toStlBytes(scene, filename);
      break;
    case "glb":
      bytes = toGlbBytes(scene, filename);
      break;
    default:
      throw new Error(`Unsupported format: .${ext}. Use .stl or .glb`);
  }

  // Write to current directory
  const path = resolve(process.cwd(), filename);
  writeFileSync(path, bytes);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          path,
          bytes: bytes.length,
          format: ext,
          parts: scene.parts.length,
        }),
      },
    ],
  };
}
