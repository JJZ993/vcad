import type { NodeId, Vec2, Vec3, SketchSegment2D, SketchConstraint } from "@vcad/ir";

export type PrimitiveKind = "cube" | "cylinder" | "sphere";
export type BooleanType = "union" | "difference" | "intersection";

/** Axis-aligned sketch plane */
export type AxisAlignedPlane = "XY" | "XZ" | "YZ";

/** Arbitrary sketch plane defined by face selection */
export interface ArbitraryPlane {
  type: "face";
  origin: Vec3;
  xDir: Vec3;
  yDir: Vec3;
  normal: Vec3;
}

/** Sketch plane - can be axis-aligned or arbitrary (from face) */
export type SketchPlane = AxisAlignedPlane | ArbitraryPlane;

/** Information about a selected face */
export interface FaceInfo {
  partId: string;
  faceIndex: number;
  normal: Vec3;
  centroid: Vec3;
}

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

export interface SweepPartInfo {
  id: string;
  name: string;
  kind: "sweep";
  sketchNodeId: NodeId;
  sweepNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
}

export interface LoftPartInfo {
  id: string;
  name: string;
  kind: "loft";
  sketchNodeIds: NodeId[];
  loftNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
}

export type PartInfo = PrimitivePartInfo | BooleanPartInfo | ExtrudePartInfo | RevolvePartInfo | SweepPartInfo | LoftPartInfo;

export function isPrimitivePart(part: PartInfo): part is PrimitivePartInfo {
  return part.kind === "cube" || part.kind === "cylinder" || part.kind === "sphere";
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

export function isSweepPart(part: PartInfo): part is SweepPartInfo {
  return part.kind === "sweep";
}

export function isLoftPart(part: PartInfo): part is LoftPartInfo {
  return part.kind === "loft";
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

/** Constraint status for visual feedback */
export type ConstraintStatus = "under" | "solved" | "over" | "error";

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
  /** Visual feedback status for constraints */
  constraintStatus: ConstraintStatus;
}

/** Get the X and Y direction vectors for a sketch plane */
export function getSketchPlaneDirections(plane: SketchPlane): { x_dir: Vec3; y_dir: Vec3; normal: Vec3 } {
  if (typeof plane === "string") {
    switch (plane) {
      case "XY":
        return { x_dir: { x: 1, y: 0, z: 0 }, y_dir: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
      case "XZ":
        return { x_dir: { x: 1, y: 0, z: 0 }, y_dir: { x: 0, y: 0, z: 1 }, normal: { x: 0, y: 1, z: 0 } };
      case "YZ":
        return { x_dir: { x: 0, y: 1, z: 0 }, y_dir: { x: 0, y: 0, z: 1 }, normal: { x: 1, y: 0, z: 0 } };
    }
  }
  // Arbitrary plane from face selection
  return { x_dir: plane.xDir, y_dir: plane.yDir, normal: plane.normal };
}

/** Check if a plane is axis-aligned */
export function isAxisAlignedPlane(plane: SketchPlane): plane is AxisAlignedPlane {
  return typeof plane === "string";
}

/** Helper to compute cross product */
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Helper to normalize a vector */
function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 0.0001) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Compute a sketch plane from a face selection */
export function computePlaneFromFace(face: FaceInfo): ArbitraryPlane {
  const normal = normalize(face.normal);

  // Build orthonormal basis - pick reference vector that isn't parallel to normal
  const ref = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const xDir = normalize(cross(ref, normal));
  const yDir = cross(normal, xDir);

  return { type: "face", origin: face.centroid, xDir, yDir, normal };
}

/** Get display name for a sketch plane */
export function getSketchPlaneName(plane: SketchPlane): string {
  if (typeof plane === "string") return plane;
  return "Face";
}
