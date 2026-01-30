/**
 * Geometry building functions for create_cad_document tool.
 */

import type { Node, NodeId, CsgOp } from "@vcad/ir";
import type { Primitive } from "./types.js";

/** Create a primitive node and return its ID. */
export function createPrimitiveNode(
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
