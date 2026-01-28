import type { NodeId, Vec2, Vec3, SketchSegment2D, SketchConstraint } from "@vcad/ir";

export type PrimitiveKind = "cube" | "cylinder" | "sphere";
export type BooleanType = "union" | "difference" | "intersection";
export type SketchPlane = "XY" | "XZ" | "YZ";

export interface PrimitivePartInfo {
  id: string;
  name: string;
  kind: PrimitiveKind;
  primitiveNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
}

export interface BooleanPartInfo {
  id: string;
  name: string;
  kind: "boolean";
  booleanType: BooleanType;
  booleanNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
  sourcePartIds: [string, string];
}

export interface ExtrudePartInfo {
  id: string;
  name: string;
  kind: "extrude";
  sketchNodeId: NodeId;
  extrudeNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
}

export interface RevolvePartInfo {
  id: string;
  name: string;
  kind: "revolve";
  sketchNodeId: NodeId;
  revolveNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
}

export type PartInfo = PrimitivePartInfo | BooleanPartInfo | ExtrudePartInfo | RevolvePartInfo;

export function isPrimitivePart(part: PartInfo): part is PrimitivePartInfo {
  return part.kind !== "boolean" && part.kind !== "extrude" && part.kind !== "revolve";
}

export function isBooleanPart(part: PartInfo): part is BooleanPartInfo {
  return part.kind === "boolean";
}

export function isExtrudePart(part: PartInfo): part is ExtrudePartInfo {
  return part.kind === "extrude";
}

export function isRevolvePart(part: PartInfo): part is RevolvePartInfo {
  return part.kind === "revolve";
}

export type ToolMode = "select" | "primitive";
export type TransformMode = "translate" | "rotate" | "scale";
export type Theme = "dark" | "light";

/** Constraint tool types */
export type ConstraintTool =
  | "none"
  | "horizontal"
  | "vertical"
  | "distance"
  | "coincident"
  | "parallel"
  | "perpendicular"
  | "length"
  | "fixed"
  | "equal";

/** Sketch editing state */
export interface SketchState {
  /** Whether sketch mode is active */
  active: boolean;
  /** The plane the sketch is on */
  plane: SketchPlane;
  /** Origin point of the sketch plane */
  origin: Vec3;
  /** Segments drawn so far */
  segments: SketchSegment2D[];
  /** Constraints on the sketch */
  constraints: SketchConstraint[];
  /** Current drawing tool */
  tool: "line" | "rectangle" | "circle";
  /** Current constraint tool (when applying constraints) */
  constraintTool: ConstraintTool;
  /** Points accumulated for current shape */
  points: Vec2[];
  /** Selected segment indices (for applying constraints) */
  selectedSegments: number[];
  /** Whether sketch is solved (constraints satisfied) */
  solved: boolean;
}

/** Get the X and Y direction vectors for a sketch plane */
export function getSketchPlaneDirections(plane: SketchPlane): { x_dir: Vec3; y_dir: Vec3 } {
  switch (plane) {
    case "XY":
      return { x_dir: { x: 1, y: 0, z: 0 }, y_dir: { x: 0, y: 1, z: 0 } };
    case "XZ":
      return { x_dir: { x: 1, y: 0, z: 0 }, y_dir: { x: 0, y: 0, z: 1 } };
    case "YZ":
      return { x_dir: { x: 0, y: 1, z: 0 }, y_dir: { x: 0, y: 0, z: 1 } };
  }
}
