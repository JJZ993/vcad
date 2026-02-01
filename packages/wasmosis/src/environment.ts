/**
 * WASM environment and import object construction.
 */

import type { SharedImports, WasmExports, WasmModule } from './types.js';

/**
 * Extract shared imports from a core module.
 */
export function extractSharedImports<T extends WasmExports>(
  coreModule: WasmModule<T>
): SharedImports {
  const exports = coreModule.exports;

  const shared: SharedImports = {
    memory: exports.memory,
  };

  if (exports.__indirect_function_table instanceof WebAssembly.Table) {
    shared.__indirect_function_table = exports.__indirect_function_table;
  }

  if (exports.__stack_pointer instanceof WebAssembly.Global) {
    shared.__stack_pointer = exports.__stack_pointer;
  }

  return shared;
}

/**
 * Create an import object for a secondary module.
 */
export function createSecondaryImports(shared: SharedImports): WebAssembly.Imports {
  const env: WebAssembly.ModuleImports = {
    memory: shared.memory,
  };

  if (shared.__indirect_function_table) {
    env.__indirect_function_table = shared.__indirect_function_table;
  }

  if (shared.__stack_pointer) {
    env.__stack_pointer = shared.__stack_pointer;
  }

  return { env };
}

/**
 * Default WASM imports for standalone modules (no shared memory).
 */
export function createStandaloneImports(): WebAssembly.Imports {
  return {
    env: {},
    wbg: {},
  };
}

/**
 * Merge additional imports into an import object.
 */
export function mergeImports(
  base: WebAssembly.Imports,
  additional: WebAssembly.Imports
): WebAssembly.Imports {
  const result: WebAssembly.Imports = {};

  // Copy base imports
  for (const [namespace, imports] of Object.entries(base)) {
    result[namespace] = { ...imports };
  }

  // Merge additional imports
  for (const [namespace, imports] of Object.entries(additional)) {
    if (result[namespace]) {
      result[namespace] = { ...result[namespace], ...imports };
    } else {
      result[namespace] = { ...imports };
    }
  }

  return result;
}
