/**
 * Position resolution logic for create_cad_document tool.
 */

import type { Vec3 } from "@vcad/ir";
import type {
  Primitive,
  BBox,
  PositionSpec,
  CoordinateValue,
  RelativePosition,
} from "./types.js";

/** Compute bounding box from a primitive definition. */
export function getPrimitiveBBox(prim: Primitive): BBox {
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
export function resolveCoordinate(
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

/** Check if a position spec is a relative position. */
export function isRelativePosition(pos: PositionSpec): pos is RelativePosition {
  return (
    typeof pos === "object" &&
    pos !== null &&
    "relativeTo" in pos &&
    "face" in pos
  );
}

/** Resolve a relative position against computed part bboxes. */
export function resolveRelativePosition(
  pos: RelativePosition,
  partBBoxes: Map<string, BBox>,
  toolPrim: Primitive,
): Vec3 {
  const targetBBox = partBBoxes.get(pos.relativeTo);
  if (!targetBBox) {
    throw new Error(`Cannot find part "${pos.relativeTo}" for relative positioning. Available parts: ${Array.from(partBBoxes.keys()).join(", ")}`);
  }

  const toolBBox = getPrimitiveBBox(toolPrim);
  const align = pos.align ?? "center";

  // Compute base position based on face
  let x: number, y: number, z: number;

  // Default to center of face
  const targetCenterX = (targetBBox.min.x + targetBBox.max.x) / 2;
  const targetCenterY = (targetBBox.min.y + targetBBox.max.y) / 2;
  const targetCenterZ = (targetBBox.min.z + targetBBox.max.z) / 2;

  // Tool dimensions for centering
  const toolWidth = toolBBox.max.x - toolBBox.min.x;
  const toolDepth = toolBBox.max.y - toolBBox.min.y;
  const toolHeight = toolBBox.max.z - toolBBox.min.z;

  switch (pos.face) {
    case "top":
      // Place on top of target (target.max.z = tool.min.z)
      x = targetCenterX - toolWidth / 2 - toolBBox.min.x;
      y = targetCenterY - toolDepth / 2 - toolBBox.min.y;
      z = targetBBox.max.z - toolBBox.min.z;
      break;
    case "bottom":
      // Place below target (target.min.z = tool.max.z)
      x = targetCenterX - toolWidth / 2 - toolBBox.min.x;
      y = targetCenterY - toolDepth / 2 - toolBBox.min.y;
      z = targetBBox.min.z - toolBBox.max.z;
      break;
    case "front":
      // Place in front of target (target.min.y = tool.max.y)
      x = targetCenterX - toolWidth / 2 - toolBBox.min.x;
      y = targetBBox.min.y - toolBBox.max.y;
      z = targetCenterZ - toolHeight / 2 - toolBBox.min.z;
      break;
    case "back":
      // Place behind target (target.max.y = tool.min.y)
      x = targetCenterX - toolWidth / 2 - toolBBox.min.x;
      y = targetBBox.max.y - toolBBox.min.y;
      z = targetCenterZ - toolHeight / 2 - toolBBox.min.z;
      break;
    case "left":
      // Place to left of target (target.min.x = tool.max.x)
      x = targetBBox.min.x - toolBBox.max.x;
      y = targetCenterY - toolDepth / 2 - toolBBox.min.y;
      z = targetCenterZ - toolHeight / 2 - toolBBox.min.z;
      break;
    case "right":
      // Place to right of target (target.max.x = tool.min.x)
      x = targetBBox.max.x - toolBBox.min.x;
      y = targetCenterY - toolDepth / 2 - toolBBox.min.y;
      z = targetCenterZ - toolHeight / 2 - toolBBox.min.z;
      break;
  }

  // Apply alignment adjustments for non-center alignments
  if (align !== "center") {
    // For faces perpendicular to an axis, adjust the other two axes
    if (pos.face === "top" || pos.face === "bottom") {
      // Align on X-Y plane
      if (align === "min") {
        x = targetBBox.min.x - toolBBox.min.x;
        y = targetBBox.min.y - toolBBox.min.y;
      } else {
        x = targetBBox.max.x - toolBBox.max.x;
        y = targetBBox.max.y - toolBBox.max.y;
      }
    } else if (pos.face === "front" || pos.face === "back") {
      // Align on X-Z plane
      if (align === "min") {
        x = targetBBox.min.x - toolBBox.min.x;
        z = targetBBox.min.z - toolBBox.min.z;
      } else {
        x = targetBBox.max.x - toolBBox.max.x;
        z = targetBBox.max.z - toolBBox.max.z;
      }
    } else {
      // left/right: Align on Y-Z plane
      if (align === "min") {
        y = targetBBox.min.y - toolBBox.min.y;
        z = targetBBox.min.z - toolBBox.min.z;
      } else {
        y = targetBBox.max.y - toolBBox.max.y;
        z = targetBBox.max.z - toolBBox.max.z;
      }
    }
  }

  // Apply offset
  const offset = pos.offset ?? {};
  x += offset.x ?? 0;
  y += offset.y ?? 0;
  z += offset.z ?? 0;

  return { x, y, z };
}

/** Resolve a position specification to absolute Vec3 coordinates. */
export function resolvePosition(pos: PositionSpec, basePrim: Primitive): Vec3 {
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

  // Relative positions should not reach here - they're handled by resolveRelativePosition
  if (isRelativePosition(pos)) {
    throw new Error("Relative positions must be resolved with resolveRelativePosition");
  }

  // Object with coordinates (absolute or percentage)
  return {
    x: resolveCoordinate(pos.x, bbox.min.x, bbox.max.x),
    y: resolveCoordinate(pos.y, bbox.min.y, bbox.max.y),
    z: resolveCoordinate(pos.z ?? 0, bbox.min.z, bbox.max.z),
  };
}

/** Transform a bounding box by a translation. */
export function translateBBox(bbox: BBox, offset: Vec3): BBox {
  return {
    min: {
      x: bbox.min.x + offset.x,
      y: bbox.min.y + offset.y,
      z: bbox.min.z + offset.z,
    },
    max: {
      x: bbox.max.x + offset.x,
      y: bbox.max.y + offset.y,
      z: bbox.max.z + offset.z,
    },
  };
}

/** Union two bounding boxes. */
export function unionBBox(a: BBox, b: BBox): BBox {
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}
