import type { TriangleMesh } from "./mesh.js";

/**
 * Cache key for mesh lookups.
 * Combines the solid's identity with tessellation parameters.
 */
interface MeshCacheKey {
  /** Unique identifier for the solid (typically a pointer or hash) */
  solidId: number;
  /** Segment count used for tessellation (affects quality) */
  segments: number;
}

function keyToString(key: MeshCacheKey): string {
  return `${key.solidId}:${key.segments}`;
}

/**
 * Cache for tessellated meshes (Solid -> TriangleMesh).
 *
 * Tessellation is one of the most expensive operations in the rendering
 * pipeline. This cache stores the result of getMesh() calls keyed by
 * solid identity and tessellation parameters.
 */
export class MeshCache {
  private cache = new Map<string, TriangleMesh>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Get a cached mesh if it exists.
   */
  get(solidId: number, segments: number): TriangleMesh | null {
    const key = keyToString({ solidId, segments });
    return this.cache.get(key) ?? null;
  }

  /**
   * Cache a mesh.
   */
  set(solidId: number, segments: number, mesh: TriangleMesh): void {
    const key = keyToString({ solidId, segments });

    // Simple LRU: if at max size, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.maxSize / 4);
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }

    this.cache.set(key, mesh);
  }

  /**
   * Check if a mesh is cached.
   */
  has(solidId: number, segments: number): boolean {
    const key = keyToString({ solidId, segments });
    return this.cache.has(key);
  }

  /**
   * Invalidate all cached meshes for a specific solid.
   */
  invalidateSolid(solidId: number): void {
    const prefix = `${solidId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached meshes.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current cache size.
   */
  get size(): number {
    return this.cache.size;
  }
}
