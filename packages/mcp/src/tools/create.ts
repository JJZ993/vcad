/**
 * create_cad_document tool — build geometry from structured input.
 */

import type { Document, Node, NodeId, CsgOp, Vec3 } from "@vcad/ir";
import { createDocument } from "@vcad/ir";

/** Primitive definition for tool input. */
interface Primitive {
  type: "cube" | "cylinder" | "sphere" | "cone";
  // Cube
  size?: Vec3;
  // Cylinder/Sphere/Cone
  radius?: number;
  height?: number;
  segments?: number;
  // Cone
  radius_bottom?: number;
  radius_top?: number;
}

/** Named position for relative positioning. */
type NamedPosition = "center" | "top-center" | "bottom-center";

/** Coordinate value: absolute number or percentage string. */
type CoordinateValue = number | string;

/** Position specification: absolute Vec3, named position, or percentage-based. */
type PositionSpec =
  | Vec3
  | NamedPosition
  | { x: CoordinateValue; y: CoordinateValue; z?: CoordinateValue };

/** Bounding box representation. */
interface BBox {
  min: Vec3;
  max: Vec3;
}

/** Operation to apply to geometry. */
interface Operation {
  type:
    | "union"
    | "difference"
    | "intersection"
    | "translate"
    | "rotate"
    | "scale"
    | "linear_pattern"
    | "circular_pattern"
    | "hole";
  // For boolean ops
  primitive?: Primitive;
  at?: PositionSpec;
  // For hole
  diameter?: number;
  depth?: number;
  // For translate
  offset?: Vec3;
  // For rotate (degrees)
  angles?: Vec3;
  // For scale
  factor?: Vec3;
  // For linear_pattern
  direction?: Vec3;
  count?: number;
  spacing?: number;
  // For circular_pattern
  axis_origin?: Vec3;
  axis_dir?: Vec3;
  angle_deg?: number;
}

/** Part definition for tool input. */
interface PartInput {
  name: string;
  primitive: Primitive;
  operations?: Operation[];
  material?: string;
}

/** Input schema for create_cad_document. */
interface CreateInput {
  parts: PartInput[];
}

/** Compute bounding box from a primitive definition. */
function getPrimitiveBBox(prim: Primitive): BBox {
  switch (prim.type) {
    case "cube": {
      const size = prim.size ?? { x: 10, y: 10, z: 10 };
      // Cube: corner at (0,0,0), extends to (size.x, size.y, size.z)
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: size.x, y: size.y, z: size.z },
      };
    }
    case "cylinder": {
      const r = prim.radius ?? 5;
      const h = prim.height ?? 10;
      // Cylinder: base center at (0,0,0), height along +Z
      return {
        min: { x: -r, y: -r, z: 0 },
        max: { x: r, y: r, z: h },
      };
    }
    case "sphere": {
      const r = prim.radius ?? 5;
      // Sphere: center at (0,0,0)
      return {
        min: { x: -r, y: -r, z: -r },
        max: { x: r, y: r, z: r },
      };
    }
    case "cone": {
      const rb = prim.radius_bottom ?? prim.radius ?? 5;
      const rt = prim.radius_top ?? 0;
      const h = prim.height ?? 10;
      const maxR = Math.max(rb, rt);
      // Cone: base center at (0,0,0), height along +Z
      return {
        min: { x: -maxR, y: -maxR, z: 0 },
        max: { x: maxR, y: maxR, z: h },
      };
    }
  }
}

/** Resolve a single coordinate value (number or percentage string). */
function resolveCoordinate(
  value: CoordinateValue,
  minVal: number,
  maxVal: number,
): number {
  if (typeof value === "number") {
    return value;
  }
  // Parse percentage string like "50%"
  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (match) {
    const pct = parseFloat(match[1]) / 100;
    return minVal + pct * (maxVal - minVal);
  }
  throw new Error(`Invalid coordinate value: ${value}`);
}

/** Resolve a position specification to absolute Vec3 coordinates. */
function resolvePosition(pos: PositionSpec, basePrim: Primitive): Vec3 {
  const bbox = getPrimitiveBBox(basePrim);

  // Named positions
  if (typeof pos === "string") {
    const centerX = (bbox.min.x + bbox.max.x) / 2;
    const centerY = (bbox.min.y + bbox.max.y) / 2;
    const centerZ = (bbox.min.z + bbox.max.z) / 2;

    switch (pos) {
      case "center":
        return { x: centerX, y: centerY, z: centerZ };
      case "top-center":
        return { x: centerX, y: centerY, z: bbox.max.z };
      case "bottom-center":
        return { x: centerX, y: centerY, z: bbox.min.z };
      default:
        throw new Error(`Unknown named position: ${pos}`);
    }
  }

  // Object with coordinates (absolute or percentage)
  return {
    x: resolveCoordinate(pos.x, bbox.min.x, bbox.max.x),
    y: resolveCoordinate(pos.y, bbox.min.y, bbox.max.y),
    z: resolveCoordinate(pos.z ?? 0, bbox.min.z, bbox.max.z),
  };
}

/** JSON Schema for input validation. */
export const createCadDocumentSchema = {
  type: "object" as const,
  properties: {
    parts: {
      type: "array" as const,
      description: "Parts to create in the document",
      items: {
        type: "object" as const,
        properties: {
          name: {
            type: "string" as const,
            description: "Name of the part",
          },
          primitive: {
            type: "object" as const,
            description:
              "Base primitive shape. Origins: cube has corner at (0,0,0) extending to (size.x, size.y, size.z); cylinder has base center at (0,0,0) with height along +Z; sphere has center at (0,0,0); cone has base center at (0,0,0) with height along +Z.",
            properties: {
              type: {
                type: "string" as const,
                enum: ["cube", "cylinder", "sphere", "cone"],
                description:
                  "Primitive type. Cube: corner at origin. Cylinder: base center at origin, +Z up. Sphere: center at origin. Cone: base center at origin, +Z up.",
              },
              size: {
                type: "object" as const,
                description:
                  "Size for cube (x, y, z dimensions in mm). Cube extends from (0,0,0) to (size.x, size.y, size.z).",
                properties: {
                  x: { type: "number" as const },
                  y: { type: "number" as const },
                  z: { type: "number" as const },
                },
              },
              radius: {
                type: "number" as const,
                description: "Radius for cylinder/sphere (mm)",
              },
              height: {
                type: "number" as const,
                description: "Height for cylinder/cone (mm), extends along +Z axis",
              },
              segments: {
                type: "number" as const,
                description: "Number of segments for curved surfaces (default: 32)",
              },
              radius_bottom: {
                type: "number" as const,
                description: "Bottom radius for cone (mm)",
              },
              radius_top: {
                type: "number" as const,
                description: "Top radius for cone (mm, 0 for pointed cone)",
              },
            },
            required: ["type"],
          },
          operations: {
            type: "array" as const,
            description: "Operations to apply (in order)",
            items: {
              type: "object" as const,
              properties: {
                type: {
                  type: "string" as const,
                  enum: [
                    "union",
                    "difference",
                    "intersection",
                    "translate",
                    "rotate",
                    "scale",
                    "linear_pattern",
                    "circular_pattern",
                    "hole",
                  ],
                  description:
                    "Operation type. 'hole' creates a vertical through-hole (cylinder difference along Z axis).",
                },
                primitive: {
                  type: "object" as const,
                  description: "Primitive for boolean operations",
                },
                at: {
                  oneOf: [
                    {
                      type: "object" as const,
                      description: "Absolute position {x, y, z} in mm",
                      properties: {
                        x: { type: "number" as const },
                        y: { type: "number" as const },
                        z: { type: "number" as const },
                      },
                    },
                    {
                      type: "string" as const,
                      enum: ["center", "top-center", "bottom-center"],
                      description: "Named position relative to base primitive",
                    },
                    {
                      type: "object" as const,
                      description:
                        "Percentage position {x: '50%', y: '50%'} relative to base primitive bounds",
                      properties: {
                        x: { oneOf: [{ type: "number" as const }, { type: "string" as const }] },
                        y: { oneOf: [{ type: "number" as const }, { type: "string" as const }] },
                        z: { oneOf: [{ type: "number" as const }, { type: "string" as const }] },
                      },
                    },
                  ],
                  description:
                    "Position for operation. Accepts: absolute {x,y,z}, named ('center', 'top-center', 'bottom-center'), or percentage ({x:'50%', y:'50%'}).",
                },
                diameter: {
                  type: "number" as const,
                  description: "Diameter for hole operation (mm)",
                },
                depth: {
                  type: "number" as const,
                  description:
                    "Depth for hole operation (mm). Omit for through-hole (auto-sized to pass through part).",
                },
                offset: {
                  type: "object" as const,
                  description: "Translation offset (mm)",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                angles: {
                  type: "object" as const,
                  description: "Rotation angles (degrees)",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                factor: {
                  type: "object" as const,
                  description: "Scale factors",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                direction: {
                  type: "object" as const,
                  description: "Direction for linear pattern",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                count: {
                  type: "number" as const,
                  description: "Number of copies for patterns",
                },
                spacing: {
                  type: "number" as const,
                  description: "Spacing for linear pattern (mm)",
                },
                axis_origin: {
                  type: "object" as const,
                  description: "Axis origin for circular pattern",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                axis_dir: {
                  type: "object" as const,
                  description: "Axis direction for circular pattern",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                angle_deg: {
                  type: "number" as const,
                  description: "Total angle for circular pattern (degrees)",
                },
              },
              required: ["type"],
            },
          },
          material: {
            type: "string" as const,
            description: "Material key (e.g., 'aluminum', 'steel')",
          },
        },
        required: ["name", "primitive"],
      },
    },
  },
  required: ["parts"],
};

/** Create a primitive node and return its ID. */
function createPrimitiveNode(
  prim: Primitive,
  nodes: Record<string, Node>,
  nextId: { value: NodeId },
): NodeId {
  const id = nextId.value++;
  let op: CsgOp;

  switch (prim.type) {
    case "cube":
      op = {
        type: "Cube",
        size: prim.size ?? { x: 10, y: 10, z: 10 },
      };
      break;
    case "cylinder":
      op = {
        type: "Cylinder",
        radius: prim.radius ?? 5,
        height: prim.height ?? 10,
        segments: prim.segments ?? 32,
      };
      break;
    case "sphere":
      op = {
        type: "Sphere",
        radius: prim.radius ?? 5,
        segments: prim.segments ?? 32,
      };
      break;
    case "cone":
      op = {
        type: "Cone",
        radius_bottom: prim.radius_bottom ?? prim.radius ?? 5,
        radius_top: prim.radius_top ?? 0,
        height: prim.height ?? 10,
        segments: prim.segments ?? 32,
      };
      break;
  }

  nodes[String(id)] = { id, name: null, op };
  return id;
}

/** Build an IR document from tool input. */
export function createCadDocument(
  input: unknown,
): { content: Array<{ type: "text"; text: string }> } {
  const { parts } = input as CreateInput;
  const doc = createDocument();
  const nextId = { value: 1 };

  for (const part of parts) {
    // Create base primitive
    let currentId = createPrimitiveNode(part.primitive, doc.nodes, nextId);

    // Apply operations
    if (part.operations) {
      for (const op of part.operations) {
        const newId = nextId.value++;
        let newOp: CsgOp;

        switch (op.type) {
          case "union":
          case "difference":
          case "intersection": {
            if (!op.primitive) {
              throw new Error(`${op.type} requires a primitive`);
            }
            // Create the tool primitive
            let toolId = createPrimitiveNode(op.primitive, doc.nodes, nextId);
            // Translate it if needed
            if (op.at) {
              const resolvedPos = resolvePosition(op.at, part.primitive);
              const translateId = nextId.value++;
              doc.nodes[String(translateId)] = {
                id: translateId,
                name: null,
                op: { type: "Translate", child: toolId, offset: resolvedPos },
              };
              toolId = translateId;
            }
            newOp = {
              type: op.type === "union" ? "Union" : op.type === "difference" ? "Difference" : "Intersection",
              left: currentId,
              right: toolId,
            } as CsgOp;
            break;
          }

          case "hole": {
            if (!op.diameter) {
              throw new Error("hole requires a diameter");
            }
            const radius = op.diameter / 2;
            const bbox = getPrimitiveBBox(part.primitive);
            const zExtent = bbox.max.z - bbox.min.z;
            // For through-hole, extend past part bounds; otherwise use specified depth
            const holeHeight = op.depth ?? zExtent + 2;

            // Create cylinder primitive for the hole
            const cylinderId = nextId.value++;
            doc.nodes[String(cylinderId)] = {
              id: cylinderId,
              name: null,
              op: {
                type: "Cylinder",
                radius,
                height: holeHeight,
                segments: 32,
              },
            };

            // Resolve position (default to center if not specified)
            const pos = op.at ?? "center";
            const resolvedPos = resolvePosition(pos, part.primitive);
            // For through-hole, position cylinder to start below the part
            const zOffset = op.depth ? resolvedPos.z : bbox.min.z - 1;

            const translateId = nextId.value++;
            doc.nodes[String(translateId)] = {
              id: translateId,
              name: null,
              op: {
                type: "Translate",
                child: cylinderId,
                offset: { x: resolvedPos.x, y: resolvedPos.y, z: zOffset },
              },
            };

            newOp = {
              type: "Difference",
              left: currentId,
              right: translateId,
            } as CsgOp;
            break;
          }

          case "translate":
            newOp = {
              type: "Translate",
              child: currentId,
              offset: op.offset ?? { x: 0, y: 0, z: 0 },
            };
            break;

          case "rotate":
            newOp = {
              type: "Rotate",
              child: currentId,
              angles: op.angles ?? { x: 0, y: 0, z: 0 },
            };
            break;

          case "scale":
            newOp = {
              type: "Scale",
              child: currentId,
              factor: op.factor ?? { x: 1, y: 1, z: 1 },
            };
            break;

          case "linear_pattern":
            newOp = {
              type: "LinearPattern",
              child: currentId,
              direction: op.direction ?? { x: 1, y: 0, z: 0 },
              count: op.count ?? 2,
              spacing: op.spacing ?? 10,
            };
            break;

          case "circular_pattern":
            newOp = {
              type: "CircularPattern",
              child: currentId,
              axis_origin: op.axis_origin ?? { x: 0, y: 0, z: 0 },
              axis_dir: op.axis_dir ?? { x: 0, y: 0, z: 1 },
              count: op.count ?? 4,
              angle_deg: op.angle_deg ?? 360,
            };
            break;
        }

        doc.nodes[String(newId)] = { id: newId, name: part.name, op: newOp };
        currentId = newId;
      }
    }

    // Set the name on the final node
    const finalNode = doc.nodes[String(currentId)];
    if (finalNode) {
      finalNode.name = part.name;
    }

    // Add to roots
    doc.roots.push({
      root: currentId,
      material: part.material ?? "default",
    });

    // Track material assignment
    doc.part_materials[part.name] = part.material ?? "default";
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(doc, null, 2),
      },
    ],
  };
}
