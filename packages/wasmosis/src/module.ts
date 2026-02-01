/**
 * Module definition helpers.
 */

import type { ModuleDefinition, WasmExports, WasmLoader } from './types.js';

/**
 * Options for defining a module.
 */
export interface DefineModuleOptions<T extends WasmExports = WasmExports> {
  /** Unique name of this module */
  name: string;

  /** Function to load the WASM bytes */
  loader: WasmLoader;

  /** Names of modules this depends on */
  depends?: string[];

  /** Custom initialization after instantiation */
  init?: ModuleDefinition<T>['init'];
}

/**
 * Define a WASM module for use with the registry.
 *
 * @example
 * ```ts
 * const step = defineModule({
 *   name: 'step',
 *   loader: () => fetch('./step.wasm').then(r => r.arrayBuffer()),
 *   depends: ['core'],
 * });
 * ```
 */
export function defineModule<T extends WasmExports = WasmExports>(
  options: DefineModuleOptions<T>
): ModuleDefinition<T> {
  return {
    name: options.name,
    loader: options.loader,
    depends: options.depends,
    init: options.init,
  };
}

/**
 * Create a loader from a URL.
 */
export function urlLoader(url: string, fetchFn: typeof fetch = fetch): WasmLoader {
  return async () => {
    const response = await fetchFn(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.arrayBuffer();
  };
}

/**
 * Create a loader from static bytes.
 */
export function bytesLoader(bytes: ArrayBuffer | Uint8Array): WasmLoader {
  return async () => {
    if (bytes instanceof Uint8Array) {
      // Create a new ArrayBuffer from the Uint8Array to avoid SharedArrayBuffer issues
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    }
    return bytes;
  };
}
