/**
 * @vcad/ir — Intermediate representation for the vcad CAD ecosystem.
 *
 * Mirrors the Rust `vcad-ir` crate types exactly for cross-language compatibility.
 */

/** Unique identifier for a node in the IR graph. */
export type NodeId = number;

/** 3D vector with f64 components (conventionally millimeters). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

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
  | ScaleOp;

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

/** A vcad document — the `.vcad` file format. */
export interface Document {
  version: string;
  nodes: Record<string, Node>;
  materials: Record<string, MaterialDef>;
  part_materials: Record<string, string>;
  roots: SceneEntry[];
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
