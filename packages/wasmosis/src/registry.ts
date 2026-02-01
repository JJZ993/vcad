/**
 * Registry for managing lazy-loaded WASM modules.
 */

import type {
  ModuleDefinition,
  ModuleState,
  RegistryConfig,
  SharedImports,
  WasmExports,
  WasmModule,
} from './types.js';
import { topologicalSort, validateGraph } from './graph.js';
import { createSecondaryImports, extractSharedImports } from './environment.js';

/**
 * Registry manages lazy loading and caching of WASM modules.
 *
 * @example
 * ```ts
 * const registry = createRegistry({
 *   core: defineModule({ name: 'core', loader: () => fetch('./core.wasm') }),
 *   step: defineModule({ name: 'step', loader: () => fetch('./step.wasm'), depends: ['core'] }),
 * });
 *
 * // Load a module (dependencies loaded automatically)
 * const step = await registry.load('step');
 * step.exports.import_step(buffer);
 * ```
 */
export class Registry {
  private definitions: Map<string, ModuleDefinition> = new Map();
  private states: Map<string, ModuleState> = new Map();
  private config: RegistryConfig;

  constructor(
    modules: Record<string, ModuleDefinition>,
    config: RegistryConfig = {}
  ) {
    this.config = config;

    // Register all modules
    for (const mod of Object.values(modules)) {
      this.definitions.set(mod.name, mod);
      this.states.set(mod.name, { status: 'unloaded' });
    }

    // Validate the dependency graph
    const validation = validateGraph(this.definitions);
    if (!validation.valid) {
      throw new Error(`Invalid module graph: ${validation.error}`);
    }
  }

  /**
   * Load a module by name. Dependencies are loaded automatically.
   * Returns cached module if already loaded.
   */
  async load<T extends WasmExports = WasmExports>(name: string): Promise<WasmModule<T>> {
    const state = this.states.get(name);
    if (!state) {
      throw new Error(`Unknown module: ${name}`);
    }

    // Return cached module
    if (state.status === 'loaded') {
      return state.module as WasmModule<T>;
    }

    // Return in-flight promise (deduplication)
    if (state.status === 'loading') {
      return state.promise as Promise<WasmModule<T>>;
    }

    // Rethrow previous error
    if (state.status === 'error') {
      throw state.error;
    }

    // Start loading
    const promise = this.loadModule<T>(name);
    this.states.set(name, { status: 'loading', promise: promise as Promise<WasmModule> });

    try {
      const module = await promise;
      this.states.set(name, { status: 'loaded', module: module as WasmModule });
      return module;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.states.set(name, { status: 'error', error: err });
      throw err;
    }
  }

  /**
   * Check if a module is loaded.
   */
  isLoaded(name: string): boolean {
    const state = this.states.get(name);
    return state?.status === 'loaded';
  }

  /**
   * Check if a module is currently loading.
   */
  isLoading(name: string): boolean {
    const state = this.states.get(name);
    return state?.status === 'loading';
  }

  /**
   * Get module state.
   */
  getState(name: string): ModuleState | undefined {
    return this.states.get(name);
  }

  /**
   * Get all registered module names.
   */
  getModuleNames(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * Preload multiple modules in parallel.
   */
  async preload(names: string[]): Promise<void> {
    await Promise.all(names.map((name) => this.load(name)));
  }

  /**
   * Internal: load a module and its dependencies.
   */
  private async loadModule<T extends WasmExports>(name: string): Promise<WasmModule<T>> {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Unknown module: ${name}`);
    }

    // Get load order (dependencies first)
    const loadOrder = topologicalSort(this.definitions, name);

    // Load all dependencies
    let sharedImports: SharedImports | undefined;

    for (const depName of loadOrder) {
      if (depName === name) continue;

      const depModule = await this.load(depName);

      // Extract shared imports from core module (first loaded)
      if (!sharedImports) {
        sharedImports = extractSharedImports(depModule);
      }
    }

    // Load WASM bytes
    const bytes = await definition.loader();

    // Create import object
    let imports: WebAssembly.Imports;
    if (sharedImports) {
      imports = createSecondaryImports(sharedImports);
    } else {
      // Core module - use wasm-bindgen generated imports
      imports = {};
    }

    // Instantiate
    let source: WebAssembly.WebAssemblyInstantiatedSource;
    if (bytes instanceof Response) {
      source = await WebAssembly.instantiateStreaming(bytes, imports);
    } else {
      source = await WebAssembly.instantiate(bytes, imports);
    }

    const instance = source.instance;
    let exports = instance.exports as T;

    // Run custom initialization
    if (definition.init && sharedImports) {
      exports = (await definition.init(instance, sharedImports)) as T;
    }

    return { instance, exports };
  }
}

/**
 * Create a new registry from module definitions.
 */
export function createRegistry(
  modules: Record<string, ModuleDefinition>,
  config: RegistryConfig = {}
): Registry {
  return new Registry(modules, config);
}
