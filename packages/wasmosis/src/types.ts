/**
 * Core types for wasmosis module splitting system.
 */

/**
 * WebAssembly exports with memory and table.
 */
export interface WasmExports {
  memory: WebAssembly.Memory;
  __indirect_function_table?: WebAssembly.Table;
  __stack_pointer?: WebAssembly.Global;
  [key: string]: unknown;
}

/**
 * A loaded WASM module instance with its exports.
 */
export interface WasmModule<T extends WasmExports = WasmExports> {
  instance: WebAssembly.Instance;
  exports: T;
}

/**
 * Function that loads WASM bytes (e.g., () => fetch('./module.wasm'))
 */
export type WasmLoader = () => Promise<ArrayBuffer | Response>;

/**
 * Shared imports passed from core module to secondary modules.
 */
export interface SharedImports {
  memory: WebAssembly.Memory;
  __indirect_function_table?: WebAssembly.Table;
  __stack_pointer?: WebAssembly.Global;
}

/**
 * Definition of a WASM module for the registry.
 */
export interface ModuleDefinition<T extends WasmExports = WasmExports> {
  /** Unique name of this module */
  name: string;

  /** Function to load the WASM bytes */
  loader: WasmLoader;

  /** Names of modules this depends on (must be loaded first) */
  depends?: string[];

  /** Custom initialization after instantiation */
  init?: (instance: WebAssembly.Instance, shared: SharedImports) => Promise<T> | T;
}

/**
 * State of a module in the registry.
 */
export type ModuleState<T extends WasmExports = WasmExports> =
  | { status: 'unloaded' }
  | { status: 'loading'; promise: Promise<WasmModule<T>> }
  | { status: 'loaded'; module: WasmModule<T> }
  | { status: 'error'; error: Error };

/**
 * Configuration for the registry.
 */
export interface RegistryConfig {
  /** Base URL for loading WASM files */
  baseUrl?: string;

  /** Custom fetch function */
  fetch?: typeof fetch;
}

/**
 * Metadata extracted from WASM custom sections.
 */
export interface WasmMetadata {
  /** Module name from custom section */
  moduleName: string;

  /** Functions belonging to this module */
  functions: string[];
}

/**
 * Split configuration derived from WASM analysis.
 */
export interface SplitConfig {
  /** Core module (always loaded) */
  core: {
    functions: string[];
  };

  /** Secondary modules (lazy loaded) */
  secondary: Map<string, {
    functions: string[];
    depends: string[];
  }>;
}

/**
 * Output from the splitter.
 */
export interface SplitOutput {
  /** Path to core.wasm */
  corePath: string;

  /** Paths to secondary modules */
  secondaryPaths: Map<string, string>;

  /** Generated registry TypeScript code */
  registryCode: string;

  /** Generated type definitions */
  typesCode: string;
}

/**
 * Custom section name used by wasmosis macro.
 */
export const WASMOSIS_SECTION_NAME = 'wasmosis_module';
