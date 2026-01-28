/** Triangle mesh output — positions and indices ready for rendering. */
export interface TriangleMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/** A single evaluated part with its mesh and material key. */
export interface EvaluatedPart {
  mesh: TriangleMesh;
  material: string;
}

/** Result of evaluating a full document — one part per scene root. */
export interface EvaluatedScene {
  parts: EvaluatedPart[];
  /** Meshes representing intersections between overlapping parts (for clash visualization). */
  clashes: TriangleMesh[];
}
