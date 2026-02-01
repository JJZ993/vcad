import type { NodeId, CsgOp } from "@vcad/ir";
import type { Solid } from "@vcad/kernel-wasm";

/**
 * Hash a CsgOp to detect parameter changes.
 * Returns a stable string that uniquely identifies the operation and its parameters.
 */
export function hashCsgOp(op: CsgOp): string {
  // Use JSON.stringify for a simple but effective hash
  // This works because CsgOp has consistent field ordering
  return JSON.stringify(op);
}

interface CacheEntry {
  solid: Solid;
  opHash: string;
}

/**
 * Persistent cache for Solid objects across document evaluations.
 *
 * Unlike the per-evaluation Map cache in evaluateDocument, this cache
 * persists across multiple evaluations and uses operation hashing to
 * detect when cached values are still valid.
 */
export class SolidCache {
  private cache = new Map<NodeId, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Get a cached solid if it exists and the op hash matches.
   * Returns null if not cached or if the operation has changed.
   */
  get(nodeId: NodeId, opHash: string): Solid | null {
    const entry = this.cache.get(nodeId);
    if (!entry) return null;
    if (entry.opHash !== opHash) {
      // Operation changed, invalidate this entry
      this.cache.delete(nodeId);
      return null;
    }
    return entry.solid;
  }

  /**
   * Cache a solid with its operation hash.
   */
  set(nodeId: NodeId, solid: Solid, opHash: string): void {
    // Simple LRU: if at max size, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.maxSize / 4);
      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
    }
    this.cache.set(nodeId, { solid, opHash });
  }

  /**
   * Check if a node is cached (regardless of whether the hash matches).
   */
  has(nodeId: NodeId): boolean {
    return this.cache.has(nodeId);
  }

  /**
   * Invalidate specific nodes and all their dependents.
   * Call this when nodes are modified.
   */
  invalidate(nodeIds: Set<NodeId>): void {
    for (const nodeId of nodeIds) {
      this.cache.delete(nodeId);
    }
  }

  /**
   * Invalidate all cached entries.
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
