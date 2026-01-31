/**
 * GPU-accelerated geometry processing utilities.
 *
 * This module provides GPU compute shader acceleration for:
 * - Creased normal computation
 * - Mesh decimation for LOD generation
 */

let wasmModule: typeof import("@vcad/kernel-wasm") | null = null;
let gpuAvailable = false;

/**
 * Result of GPU geometry processing.
 */
export interface GpuGeometryResult {
  /** Vertex positions (flat array: x, y, z, ...) */
  positions: Float32Array;
  /** Triangle indices */
  indices: Uint32Array;
  /** Vertex normals (flat array: nx, ny, nz, ...) */
  normals: Float32Array;
}

/**
 * Initialize the GPU context for accelerated geometry processing.
 *
 * Should be called once at application startup, after the WASM module is loaded.
 * Safe to call multiple times - subsequent calls return the cached result.
 *
 * @returns true if WebGPU is available and initialized
 */
export async function initializeGpu(): Promise<boolean> {
  if (gpuAvailable) return true;

  try {
    if (!wasmModule) {
      wasmModule = await import("@vcad/kernel-wasm");
    }

    // @ts-expect-error initGpu may not be defined if GPU feature is disabled
    if (typeof wasmModule.initGpu === "function") {
      // @ts-expect-error
      gpuAvailable = await wasmModule.initGpu();
      console.log(`[GPU] WebGPU ${gpuAvailable ? "available" : "not available"}`);
    } else {
      console.log("[GPU] GPU feature not compiled into WASM module");
      gpuAvailable = false;
    }

    return gpuAvailable;
  } catch (e) {
    console.warn("[GPU] Init failed:", e);
    return false;
  }
}

/**
 * Check if GPU processing is currently available.
 */
export function isGpuAvailable(): boolean {
  return gpuAvailable;
}

/**
 * Process geometry with GPU acceleration.
 *
 * Computes creased normals and optionally generates LOD meshes.
 *
 * @param positions - Flat array of vertex positions (x, y, z, ...)
 * @param indices - Triangle indices
 * @param creaseAngle - Angle in radians for creased normal computation (default: PI/6 = 30 degrees)
 * @param generateLod - If true, returns multiple LOD levels
 * @returns Array of geometry results. If generateLod is true, returns [full, 50%, 25%].
 * @throws Error if GPU is not available
 */
export async function processGeometryGpu(
  positions: Float32Array,
  indices: Uint32Array,
  creaseAngle: number = Math.PI / 6,
  generateLod: boolean = false
): Promise<GpuGeometryResult[]> {
  if (!gpuAvailable) {
    throw new Error("GPU not available - call initializeGpu() first");
  }

  if (!wasmModule) {
    throw new Error("WASM module not loaded");
  }

  // @ts-expect-error processGeometryGpu may not be defined
  const results = await wasmModule.processGeometryGpu(
    Array.from(positions),
    Array.from(indices),
    creaseAngle,
    generateLod
  );

  return results.map((r: { positions: number[]; indices: number[]; normals: number[] }) => ({
    positions: new Float32Array(r.positions),
    indices: new Uint32Array(r.indices),
    normals: new Float32Array(r.normals),
  }));
}

/**
 * Compute creased normals using GPU acceleration.
 *
 * @param positions - Flat array of vertex positions (x, y, z, ...)
 * @param indices - Triangle indices
 * @param creaseAngle - Angle in radians; faces meeting at sharper angles get hard edges
 * @returns Flat array of normals (nx, ny, nz, ...), same length as positions
 * @throws Error if GPU is not available
 */
export async function computeCreasedNormalsGpu(
  positions: Float32Array,
  indices: Uint32Array,
  creaseAngle: number
): Promise<Float32Array> {
  if (!gpuAvailable) {
    throw new Error("GPU not available - call initializeGpu() first");
  }

  if (!wasmModule) {
    throw new Error("WASM module not loaded");
  }

  // @ts-expect-error computeCreasedNormalsGpu may not be defined
  const normals = await wasmModule.computeCreasedNormalsGpu(
    Array.from(positions),
    Array.from(indices),
    creaseAngle
  );

  return new Float32Array(normals);
}

/**
 * Decimate a mesh to reduce triangle count using GPU acceleration.
 *
 * @param positions - Flat array of vertex positions
 * @param indices - Triangle indices
 * @param targetRatio - Target ratio of triangles to keep (0.5 = 50%)
 * @returns Decimated mesh with positions, indices, and normals
 * @throws Error if GPU is not available
 */
export async function decimateMeshGpu(
  positions: Float32Array,
  indices: Uint32Array,
  targetRatio: number
): Promise<GpuGeometryResult> {
  if (!gpuAvailable) {
    throw new Error("GPU not available - call initializeGpu() first");
  }

  if (!wasmModule) {
    throw new Error("WASM module not loaded");
  }

  // @ts-expect-error decimateMeshGpu may not be defined
  const result = await wasmModule.decimateMeshGpu(
    Array.from(positions),
    Array.from(indices),
    targetRatio
  );

  return {
    positions: new Float32Array(result.positions),
    indices: new Uint32Array(result.indices),
    normals: new Float32Array(result.normals),
  };
}

/**
 * Merge multiple triangle meshes into a single mesh.
 *
 * This is a CPU operation but useful as a pre-processing step before GPU processing.
 *
 * @param meshes - Array of meshes to merge
 * @returns Single merged mesh
 */
export function mergeMeshes(
  meshes: Array<{ positions: Float32Array; indices: Uint32Array }>
): { positions: Float32Array; indices: Uint32Array } {
  // Calculate total sizes
  let totalVertices = 0;
  let totalIndices = 0;
  for (const mesh of meshes) {
    totalVertices += mesh.positions.length;
    totalIndices += mesh.indices.length;
  }

  // Allocate output arrays
  const positions = new Float32Array(totalVertices);
  const indices = new Uint32Array(totalIndices);

  // Copy data
  let vertexOffset = 0;
  let indexOffset = 0;
  let baseVertex = 0;

  for (const mesh of meshes) {
    // Copy positions
    positions.set(mesh.positions, vertexOffset);

    // Copy indices with offset
    for (let i = 0; i < mesh.indices.length; i++) {
      indices[indexOffset + i] = mesh.indices[i] + baseVertex;
    }

    vertexOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
    baseVertex += mesh.positions.length / 3;
  }

  return { positions, indices };
}
