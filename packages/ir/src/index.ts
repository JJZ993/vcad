/**
 * @vcad/ir — Intermediate representation for the vcad CAD ecosystem.
 *
 * Mirrors the Rust `vcad-ir` crate types exactly for cross-language compatibility.
 */

/** Unique identifier for a node in the IR graph. */
export type NodeId = number;

/** 2D vector with f64 components (for sketch coordinates). */
export interface Vec2 {
  x: number;
  y: number;
}

/** 3D vector with f64 components (conventionally millimeters). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 3D transform (translation, rotation in degrees, scale). */
export interface Transform3D {
  translation: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

/** Create an identity transform (no translation, rotation, or scaling). */
export function identityTransform(): Transform3D {
  return {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

// --- SketchSegment2D discriminated union ---

export interface LineSegment2D {
  type: "Line";
  start: Vec2;
  end: Vec2;
}

export interface ArcSegment2D {
  type: "Arc";
  start: Vec2;
  end: Vec2;
  center: Vec2;
  ccw: boolean;
}

/** A segment of a 2D sketch profile. */
export type SketchSegment2D = LineSegment2D | ArcSegment2D;

// --- Sketch Constraints ---

/** Reference to a point within a sketch entity. */
export type EntityRef =
  | { type: "Point"; index: number }
  | { type: "LineStart"; index: number }
  | { type: "LineEnd"; index: number }
  | { type: "ArcStart"; index: number }
  | { type: "ArcEnd"; index: number }
  | { type: "Center"; index: number };

/** Coincident constraint - two points at the same location. */
export interface CoincidentConstraint {
  type: "Coincident";
  pointA: EntityRef;
  pointB: EntityRef;
}

/** Horizontal constraint - line parallel to X axis. */
export interface HorizontalConstraint {
  type: "Horizontal";
  line: number;
}

/** Vertical constraint - line parallel to Y axis. */
export interface VerticalConstraint {
  type: "Vertical";
  line: number;
}

/** Parallel constraint - two lines are parallel. */
export interface ParallelConstraint {
  type: "Parallel";
  lineA: number;
  lineB: number;
}

/** Perpendicular constraint - two lines are perpendicular. */
export interface PerpendicularConstraint {
  type: "Perpendicular";
  lineA: number;
  lineB: number;
}

/** Fixed constraint - point at a fixed position. */
export interface FixedConstraint {
  type: "Fixed";
  point: EntityRef;
  x: number;
  y: number;
}

/** Distance constraint - distance between two points. */
export interface DistanceConstraint {
  type: "Distance";
  pointA: EntityRef;
  pointB: EntityRef;
  distance: number;
}

/** Length constraint - length of a line. */
export interface LengthConstraint {
  type: "Length";
  line: number;
  length: number;
}

/** Equal length constraint - two lines have same length. */
export interface EqualLengthConstraint {
  type: "EqualLength";
  lineA: number;
  lineB: number;
}

/** Radius constraint - circle/arc has specific radius. */
export interface RadiusConstraint {
  type: "Radius";
  circle: number;
  radius: number;
}

/** Angle constraint - angle between two lines. */
export interface AngleConstraint {
  type: "Angle";
  lineA: number;
  lineB: number;
  angleDeg: number;
}

/** A constraint on sketch entities. */
export type SketchConstraint =
  | CoincidentConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | FixedConstraint
  | DistanceConstraint
  | LengthConstraint
  | EqualLengthConstraint
  | RadiusConstraint
  | AngleConstraint;

// --- CsgOp discriminated union ---

export interface CubeOp {
  type: "Cube";
  size: Vec3;
}

export interface CylinderOp {
  type: "Cylinder";
  radius: number;
  height: number;
  segments: number;
}

export interface SphereOp {
  type: "Sphere";
  radius: number;
  segments: number;
}

export interface ConeOp {
  type: "Cone";
  radius_bottom: number;
  radius_top: number;
  height: number;
  segments: number;
}

export interface EmptyOp {
  type: "Empty";
}

export interface UnionOp {
  type: "Union";
  left: NodeId;
  right: NodeId;
}

export interface DifferenceOp {
  type: "Difference";
  left: NodeId;
  right: NodeId;
}

export interface IntersectionOp {
  type: "Intersection";
  left: NodeId;
  right: NodeId;
}

export interface TranslateOp {
  type: "Translate";
  child: NodeId;
  offset: Vec3;
}

export interface RotateOp {
  type: "Rotate";
  child: NodeId;
  angles: Vec3;
}

export interface ScaleOp {
  type: "Scale";
  child: NodeId;
  factor: Vec3;
}

export interface Sketch2DOp {
  type: "Sketch2D";
  origin: Vec3;
  x_dir: Vec3;
  y_dir: Vec3;
  segments: SketchSegment2D[];
}

export interface ExtrudeOp {
  type: "Extrude";
  sketch: NodeId;
  direction: Vec3;
}

export interface RevolveOp {
  type: "Revolve";
  sketch: NodeId;
  axis_origin: Vec3;
  axis_dir: Vec3;
  angle_deg: number;
}

export interface LinearPatternOp {
  type: "LinearPattern";
  child: NodeId;
  direction: Vec3;
  count: number;
  spacing: number;
}

export interface CircularPatternOp {
  type: "CircularPattern";
  child: NodeId;
  axis_origin: Vec3;
  axis_dir: Vec3;
  count: number;
  angle_deg: number;
}

export interface ShellOp {
  type: "Shell";
  child: NodeId;
  thickness: number;
}

// --- Path curves for sweep operations ---

/** A straight line path from start to end. */
export interface LinePath {
  type: "Line";
  start: Vec3;
  end: Vec3;
}

/** A helical path for sweep operations. */
export interface HelixPath {
  type: "Helix";
  radius: number;
  pitch: number;
  height: number;
  turns: number;
}

/** Path curve types for sweep operations. */
export type PathCurve = LinePath | HelixPath;

/** Sweep operation — extrude a profile along a path curve. */
export interface SweepOp {
  type: "Sweep";
  sketch: NodeId;              // Reference to Sketch2D node
  path: PathCurve;             // The path to sweep along
  twist_angle?: number;        // Total twist in radians (default 0)
  scale_start?: number;        // Scale at start (default 1.0)
  scale_end?: number;          // Scale at end (default 1.0)
  path_segments?: number;      // Segments along path (0 = auto)
  arc_segments?: number;       // Segments per arc in profile (default 8)
}

/** Loft operation — interpolate between multiple profiles. */
export interface LoftOp {
  type: "Loft";
  sketches: NodeId[];          // Array of Sketch2D node references (≥2)
  closed?: boolean;            // Connect last to first (creates tube)
}

/** CSG operation — the core building block of the IR DAG. */
export type CsgOp =
  | CubeOp
  | CylinderOp
  | SphereOp
  | ConeOp
  | EmptyOp
  | UnionOp
  | DifferenceOp
  | IntersectionOp
  | TranslateOp
  | RotateOp
  | ScaleOp
  | Sketch2DOp
  | ExtrudeOp
  | RevolveOp
  | LinearPatternOp
  | CircularPatternOp
  | ShellOp
  | SweepOp
  | LoftOp;

/** A node in the IR graph. */
export interface Node {
  id: NodeId;
  name: string | null;
  op: CsgOp;
}

/** PBR material definition. */
export interface MaterialDef {
  name: string;
  color: [number, number, number];
  metallic: number;
  roughness: number;
  density?: number;
  friction?: number;
}

/** An entry in the scene — a root node with an assigned material. */
export interface SceneEntry {
  root: NodeId;
  material: string;
}

/** Joint kind variants for assembly joints. */
export type JointKind =
  | { type: "Fixed" }
  | { type: "Revolute"; axis: Vec3 }
  | { type: "Slider"; axis: Vec3 }
  | { type: "Cylindrical"; axis: Vec3 }
  | { type: "Ball" };

/** A joint connecting two instances in an assembly. */
export interface Joint {
  id: string;
  parentInstanceId: string | null;
  childInstanceId: string;
  parentAnchor: Vec3;
  childAnchor: Vec3;
  kind: JointKind;
  state: number;
}

/** An instance of a part definition in an assembly. */
export interface Instance {
  id: string;
  partDefId: string;
  name?: string;
  transform?: Transform3D;
}

/** A vcad document — the `.vcad` file format. */
export interface Document {
  version: string;
  nodes: Record<string, Node>;
  materials: Record<string, MaterialDef>;
  part_materials: Record<string, string>;
  roots: SceneEntry[];
  instances?: Instance[];
  joints?: Joint[];
}

/** Create a new empty document. */
export function createDocument(): Document {
  return {
    version: "0.1",
    nodes: {},
    materials: {},
    part_materials: {},
    roots: [],
  };
}

/** Serialize a document to a JSON string. */
export function toJson(doc: Document): string {
  return JSON.stringify(doc, null, 2);
}

/** Deserialize a document from a JSON string. */
export function fromJson(json: string): Document {
  return JSON.parse(json) as Document;
}
