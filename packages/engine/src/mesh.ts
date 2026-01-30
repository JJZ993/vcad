/** Triangle mesh output — positions, indices, and optional normals for rendering. */
export interface TriangleMesh {
  positions: Float32Array;
  indices: Uint32Array;
  /** Optional vertex normals for smooth shading. If undefined, renderer computes them. */
  normals?: Float32Array;
}

/** A single evaluated part with its mesh and material key. */
export interface EvaluatedPart {
  mesh: TriangleMesh;
  material: string;
}

/** A part definition in an assembly (reusable geometry). */
export interface EvaluatedPartDef {
  id: string;
  mesh: TriangleMesh;
}

/** An instance of a part definition with transform and material. */
export interface EvaluatedInstance {
  instanceId: string;
  partDefId: string;
  name?: string;
  mesh: TriangleMesh;
  material: string;
  transform?: {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };
}

/** Result of evaluating a full document — one part per scene root. */
export interface EvaluatedScene {
  parts: EvaluatedPart[];
  /** Part definitions for assembly mode. */
  partDefs?: EvaluatedPartDef[];
  /** Instances for assembly mode. */
  instances?: EvaluatedInstance[];
  /** Meshes representing intersections between overlapping parts (for clash visualization). */
  clashes: TriangleMesh[];
}
