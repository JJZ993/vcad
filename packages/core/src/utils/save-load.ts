import type { Document, NodeId, CsgOp, Node } from "@vcad/ir";
import { toCompact, fromCompact, createDocument } from "@vcad/ir";
import type { PartInfo, PrimitiveKind } from "../types.js";

export interface VcadFile {
  version: string;
  document: Document;
  parts: PartInfo[];
  consumedParts?: Record<string, PartInfo>;
  nextNodeId: number;
  nextPartNum: number;
}

/**
 * Serialize document to compact IR format (v0.2)
 */
export function serializeDocument(state: {
  document: Document;
  parts: PartInfo[];
  consumedParts: Record<string, PartInfo>;
  nextNodeId: number;
  nextPartNum: number;
}): string {
  return toCompact(state.document);
}

/**
 * Parse a .vcad file (supports both JSON v0.1 and compact v0.2 formats)
 */
export function parseVcadFile(content: string): VcadFile {
  const trimmed = content.trim();

  // Detect format: JSON starts with '{', compact starts with '#' or opcode
  if (trimmed.startsWith("{")) {
    return parseJsonVcadFile(trimmed);
  }

  return parseCompactVcadFile(trimmed);
}

/**
 * Parse legacy JSON format (v0.1)
 */
function parseJsonVcadFile(json: string): VcadFile {
  const data = JSON.parse(json) as VcadFile;

  // Basic validation
  if (!data.document || !Array.isArray(data.parts)) {
    throw new Error("Invalid .vcad file: missing document or parts");
  }
  if (typeof data.nextNodeId !== "number" || typeof data.nextPartNum !== "number") {
    throw new Error("Invalid .vcad file: missing nextNodeId or nextPartNum");
  }

  return data;
}

/**
 * Parse compact IR format (v0.2)
 */
function parseCompactVcadFile(compact: string): VcadFile {
  const document = fromCompact(compact);
  const parts = deriveParts(document);
  const { nextNodeId, nextPartNum } = computeNextIds(document, parts);

  return {
    version: "0.2",
    document,
    parts,
    consumedParts: {},
    nextNodeId,
    nextPartNum,
  };
}

/**
 * Derive PartInfo[] from a Document by analyzing the node graph.
 *
 * Strategy:
 * 1. For each scene root, walk backward to find the "core" operation
 * 2. Identify transform chain nodes (translate, rotate, scale)
 * 3. Build appropriate PartInfo based on the core op type
 */
export function deriveParts(document: Document): PartInfo[] {
  const parts: PartInfo[] = [];
  let partNum = 1;

  // Build a set of nodes that are referenced as children (not roots in terms of parts)
  const childNodes = new Set<NodeId>();
  for (const key of Object.keys(document.nodes)) {
    const node = document.nodes[key];
    if (!node) continue;
    const children = getChildNodes(node.op);
    for (const child of children) {
      childNodes.add(child);
    }
  }

  // Process each scene root
  for (const root of document.roots) {
    const rootNode = document.nodes[String(root.root)];
    if (!rootNode) continue;

    const partInfo = derivePartFromRoot(document, root.root, partNum);
    if (partInfo) {
      parts.push(partInfo);
      partNum++;
    }
  }

  return parts;
}

/**
 * Derive a single PartInfo from a scene root node
 */
function derivePartFromRoot(
  document: Document,
  rootNodeId: NodeId,
  partNum: number
): PartInfo | null {
  const chain = walkTransformChain(document, rootNodeId);
  if (!chain) return null;

  const { translateNodeId, rotateNodeId, scaleNodeId, coreNodeId, coreOp } = chain;

  // Get name from the translate node (where names are typically stored)
  const translateNode = document.nodes[String(translateNodeId)];
  const name = translateNode?.name ?? `Part ${partNum}`;
  const partId = `part-${partNum}`;

  // Determine part kind based on core operation
  const kind = coreOp.type;

  switch (kind) {
    case "Cube":
    case "Cylinder":
    case "Sphere":
      return {
        id: partId,
        name,
        kind: kind.toLowerCase() as PrimitiveKind,
        primitiveNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "Union":
    case "Difference":
    case "Intersection": {
      const booleanType = kind.toLowerCase() as "union" | "difference" | "intersection";
      return {
        id: partId,
        name,
        kind: "boolean",
        booleanType,
        booleanNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
        sourcePartIds: ["unknown", "unknown"], // Can't derive original part IDs
      };
    }

    case "Extrude":
      return {
        id: partId,
        name,
        kind: "extrude",
        sketchNodeId: coreOp.sketch,
        extrudeNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "Revolve":
      return {
        id: partId,
        name,
        kind: "revolve",
        sketchNodeId: coreOp.sketch,
        revolveNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "Sweep":
      return {
        id: partId,
        name,
        kind: "sweep",
        sketchNodeId: coreOp.sketch,
        sweepNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "Loft":
      return {
        id: partId,
        name,
        kind: "loft",
        sketchNodeIds: coreOp.sketches,
        loftNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "ImportedMesh":
      return {
        id: partId,
        name,
        kind: "imported-mesh",
        meshNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "Fillet":
      return {
        id: partId,
        name,
        kind: "fillet",
        sourcePartId: "unknown",
        filletNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "Chamfer":
      return {
        id: partId,
        name,
        kind: "chamfer",
        sourcePartId: "unknown",
        chamferNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "Shell":
      return {
        id: partId,
        name,
        kind: "shell",
        sourcePartId: "unknown",
        shellNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "LinearPattern":
      return {
        id: partId,
        name,
        kind: "linear-pattern",
        sourcePartId: "unknown",
        patternNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    case "CircularPattern":
      return {
        id: partId,
        name,
        kind: "circular-pattern",
        sourcePartId: "unknown",
        patternNodeId: coreNodeId,
        scaleNodeId,
        rotateNodeId,
        translateNodeId,
      };

    // Note: Mirror is in PartInfo types but not yet in IR CsgOp

    default:
      // Unknown op type, skip
      return null;
  }
}

interface TransformChain {
  translateNodeId: NodeId;
  rotateNodeId: NodeId;
  scaleNodeId: NodeId;
  coreNodeId: NodeId;
  coreOp: CsgOp;
}

/**
 * Walk backward from a root node through the transform chain.
 * Expected pattern: root(Translate) -> Rotate -> Scale -> core operation
 *
 * If transforms are missing, we create virtual identity transforms.
 */
function walkTransformChain(document: Document, rootNodeId: NodeId): TransformChain | null {
  const rootNode = document.nodes[String(rootNodeId)];
  if (!rootNode) return null;

  let translateNodeId = rootNodeId;
  let rotateNodeId = rootNodeId;
  let scaleNodeId = rootNodeId;
  let coreNodeId = rootNodeId;
  let currentOp = rootNode.op;

  // Walk down through transforms
  if (currentOp.type === "Translate") {
    translateNodeId = rootNodeId;
    const childNode = document.nodes[String(currentOp.child)];
    if (childNode) {
      currentOp = childNode.op;
      coreNodeId = currentOp.type === "Translate" ? currentOp.child : childNode.id;

      if (currentOp.type === "Rotate") {
        rotateNodeId = childNode.id;
        const childNode2 = document.nodes[String(currentOp.child)];
        if (childNode2) {
          currentOp = childNode2.op;
          coreNodeId = childNode2.id;

          if (currentOp.type === "Scale") {
            scaleNodeId = childNode2.id;
            const childNode3 = document.nodes[String(currentOp.child)];
            if (childNode3) {
              coreNodeId = childNode3.id;
              currentOp = childNode3.op;
            }
          }
        }
      } else if (currentOp.type === "Scale") {
        scaleNodeId = childNode.id;
        rotateNodeId = childNode.id; // No rotate, use scale as placeholder
        const childNode2 = document.nodes[String(currentOp.child)];
        if (childNode2) {
          coreNodeId = childNode2.id;
          currentOp = childNode2.op;
        }
      }
    }
  }

  // If root is not a transform, treat it as the core directly
  if (rootNode.op.type !== "Translate" && rootNode.op.type !== "Rotate" && rootNode.op.type !== "Scale") {
    return {
      translateNodeId: rootNodeId,
      rotateNodeId: rootNodeId,
      scaleNodeId: rootNodeId,
      coreNodeId: rootNodeId,
      coreOp: rootNode.op,
    };
  }

  return {
    translateNodeId,
    rotateNodeId,
    scaleNodeId,
    coreNodeId,
    coreOp: currentOp,
  };
}

/**
 * Get child node IDs from an operation
 */
function getChildNodes(op: CsgOp): NodeId[] {
  switch (op.type) {
    case "Translate":
    case "Rotate":
    case "Scale":
    case "LinearPattern":
    case "CircularPattern":
    case "Fillet":
    case "Chamfer":
    case "Shell":
      return [op.child];
    case "Union":
    case "Difference":
    case "Intersection":
      return [op.left, op.right];
    case "Extrude":
    case "Revolve":
    case "Sweep":
      return [op.sketch];
    case "Loft":
      return op.sketches;
    default:
      return [];
  }
}

/**
 * Compute the next available node ID and part number
 */
function computeNextIds(
  document: Document,
  parts: PartInfo[]
): { nextNodeId: number; nextPartNum: number } {
  // Find max node ID
  let maxNodeId = 0;
  for (const key of Object.keys(document.nodes)) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && id > maxNodeId) {
      maxNodeId = id;
    }
  }

  // Find max part number from part IDs
  let maxPartNum = 0;
  for (const part of parts) {
    const match = part.id.match(/^part-(\d+)$/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > maxPartNum) maxPartNum = num;
    }
  }

  return {
    nextNodeId: maxNodeId + 1,
    nextPartNum: maxPartNum + 1,
  };
}
