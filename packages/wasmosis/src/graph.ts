/**
 * Dependency graph resolution for WASM modules.
 */

import type { ModuleDefinition, WasmExports } from './types.js';

/**
 * Topologically sort module definitions based on dependencies.
 * Returns modules in the order they should be loaded.
 */
export function topologicalSort<T extends WasmExports>(
  modules: Map<string, ModuleDefinition<T>>,
  target: string
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) {
      return;
    }

    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    const mod = modules.get(name);
    if (!mod) {
      throw new Error(`Unknown module: ${name}`);
    }

    visiting.add(name);

    for (const dep of mod.depends ?? []) {
      visit(dep);
    }

    visiting.delete(name);
    visited.add(name);
    result.push(name);
  }

  visit(target);
  return result;
}

/**
 * Get all modules that depend on a given module (direct and transitive).
 */
export function getDependents<T extends WasmExports>(
  modules: Map<string, ModuleDefinition<T>>,
  target: string
): Set<string> {
  const dependents = new Set<string>();

  for (const [name, mod] of modules) {
    if (mod.depends?.includes(target)) {
      dependents.add(name);
      // Recursively get modules that depend on this dependent
      for (const transitive of getDependents(modules, name)) {
        dependents.add(transitive);
      }
    }
  }

  return dependents;
}

/**
 * Validate that all dependencies exist and there are no cycles.
 */
export function validateGraph<T extends WasmExports>(
  modules: Map<string, ModuleDefinition<T>>
): { valid: true } | { valid: false; error: string } {
  // Check all dependencies exist
  for (const [name, mod] of modules) {
    for (const dep of mod.depends ?? []) {
      if (!modules.has(dep)) {
        return {
          valid: false,
          error: `Module "${name}" depends on unknown module "${dep}"`,
        };
      }
    }
  }

  // Check for cycles by trying to sort all modules
  try {
    for (const name of modules.keys()) {
      topologicalSort(modules, name);
    }
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { valid: true };
}
