/**
 * wasmosis - Lazy WASM module splitting
 *
 * @packageDocumentation
 */

// Core types
export type {
  ModuleDefinition,
  ModuleState,
  RegistryConfig,
  SharedImports,
  SplitConfig,
  SplitOutput,
  WasmExports,
  WasmLoader,
  WasmMetadata,
  WasmModule,
} from './types.js';

export { WASMOSIS_SECTION_NAME } from './types.js';

// Module definition helpers
export { defineModule, urlLoader, bytesLoader } from './module.js';
export type { DefineModuleOptions } from './module.js';

// Registry
export { Registry, createRegistry } from './registry.js';

// Graph utilities
export { topologicalSort, getDependents, validateGraph } from './graph.js';

// Environment utilities
export {
  extractSharedImports,
  createSecondaryImports,
  createStandaloneImports,
  mergeImports,
} from './environment.js';
