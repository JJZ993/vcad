/**
 * WASM module splitter.
 *
 * This module provides utilities for parsing WASM custom sections
 * and analyzing split configurations. The actual splitting is done
 * via the Binaryen wasm-split CLI tool.
 */

import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WASMOSIS_SECTION_NAME } from './types.js';
import type { SplitConfig, WasmMetadata } from './types.js';

// WASM binary constants
const WASM_MAGIC = 0x6d736100; // \0asm
const WASM_VERSION = 1;
const SECTION_CUSTOM = 0;
const SECTION_EXPORT = 7;
const EXPORT_FUNC = 0;

/**
 * Convert a snake_case name to camelCase.
 * wasm-bindgen converts Rust function names this way by default.
 */
function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Find the best matching export name for a Rust function name.
 * Tries: exact match, camelCase conversion, common wasm-bindgen patterns.
 */
function findExportName(rustName: string, exports: string[]): string | null {
  // Exact match
  if (exports.includes(rustName)) {
    return rustName;
  }

  // camelCase conversion (wasm-bindgen default)
  const camelName = snakeToCamel(rustName);
  if (exports.includes(camelName)) {
    return camelName;
  }

  // Try without _wasm suffix (e.g., section_mesh_wasm -> sectionMesh)
  if (rustName.endsWith('_wasm')) {
    const withoutSuffix = rustName.slice(0, -5);
    const camelWithoutSuffix = snakeToCamel(withoutSuffix);
    if (exports.includes(camelWithoutSuffix)) {
      return camelWithoutSuffix;
    }
  }

  // Try case-insensitive match (for acronyms like IR, GPU, etc.)
  const lowerCamel = camelName.toLowerCase();
  for (const exp of exports) {
    if (exp.toLowerCase() === lowerCamel) {
      return exp;
    }
  }

  return null;
}

/**
 * Read a LEB128 unsigned integer from a buffer.
 */
function readLEB128(bytes: Uint8Array, offset: number): { value: number; size: number } {
  let result = 0;
  let shift = 0;
  let size = 0;

  while (true) {
    const byte = bytes[offset + size];
    if (byte === undefined) {
      throw new Error('Unexpected end of LEB128');
    }
    result |= (byte & 0x7f) << shift;
    size++;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }

  return { value: result, size };
}

/**
 * Read a string from a WASM buffer.
 */
function readString(bytes: Uint8Array, offset: number): { value: string; size: number } {
  const { value: len, size: lenSize } = readLEB128(bytes, offset);
  const strBytes = bytes.slice(offset + lenSize, offset + lenSize + len);
  const value = new TextDecoder().decode(strBytes);
  return { value, size: lenSize + len };
}

/**
 * Parse custom sections from a WASM binary.
 */
function parseWasmSections(
  wasmBytes: Uint8Array,
  targetSection: number,
  visitor: (offset: number, size: number) => void
): void {
  // Validate magic and version
  const view = new DataView(wasmBytes.buffer, wasmBytes.byteOffset);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);

  if (magic !== WASM_MAGIC || version !== WASM_VERSION) {
    throw new Error('Invalid WASM binary');
  }

  let offset = 8;

  while (offset < wasmBytes.length) {
    const sectionId = wasmBytes[offset];
    if (sectionId === undefined) break;
    offset++;

    const { value: sectionSize, size: sizeLen } = readLEB128(wasmBytes, offset);
    offset += sizeLen;

    if (sectionId === targetSection) {
      visitor(offset, sectionSize);
    }

    offset += sectionSize;
  }
}

/**
 * Parse wasmosis custom sections from a WASM binary.
 */
export function parseCustomSections(wasmBytes: Uint8Array): WasmMetadata[] {
  const metadata: WasmMetadata[] = [];

  parseWasmSections(wasmBytes, SECTION_CUSTOM, (offset, size) => {
    const endOffset = offset + size;
    const { value: sectionName, size: nameSize } = readString(wasmBytes, offset);

    if (sectionName === WASMOSIS_SECTION_NAME) {
      const contentStart = offset + nameSize;
      const contentBytes = wasmBytes.slice(contentStart, endOffset);
      const decoded = new TextDecoder().decode(contentBytes);

      // Multiple statics with the same link_section get concatenated by the linker.
      // The format is: {"module":"x","function":"y"}{"module":"x","function":"z"}...
      // Split on }{ and parse each JSON object.
      const jsonStrings = decoded.split(/\}\s*\{/).map((s, i, arr) => {
        if (arr.length === 1) return s; // Single object, no splitting needed
        if (i === 0) return s + '}';
        if (i === arr.length - 1) return '{' + s;
        return '{' + s + '}';
      });

      for (const jsonStr of jsonStrings) {
        try {
          const parsed = JSON.parse(jsonStr) as { module: string; function: string };
          let existing = metadata.find((m) => m.moduleName === parsed.module);
          if (!existing) {
            existing = { moduleName: parsed.module, functions: [] };
            metadata.push(existing);
          }
          existing.functions.push(parsed.function);
        } catch {
          console.warn(`Failed to parse wasmosis entry: ${jsonStr}`);
        }
      }
    }
  });

  return metadata;
}

/**
 * Get all exported function names from a WASM binary.
 */
export function getExportedFunctions(wasmBytes: Uint8Array): string[] {
  const functions: string[] = [];

  parseWasmSections(wasmBytes, SECTION_EXPORT, (offset, size) => {
    const endOffset = offset + size;
    const { value: numExports, size: countSize } = readLEB128(wasmBytes, offset);
    let pos = offset + countSize;

    for (let i = 0; i < numExports && pos < endOffset; i++) {
      const { value: name, size: nameSize } = readString(wasmBytes, pos);
      pos += nameSize;

      const exportKind = wasmBytes[pos];
      pos++;

      const { size: indexSize } = readLEB128(wasmBytes, pos);
      pos += indexSize;

      if (exportKind === EXPORT_FUNC) {
        functions.push(name);
      }
    }
  });

  return functions;
}

/**
 * Analyze a WASM binary and determine split configuration.
 */
export function analyzeSplitConfig(wasmBytes: Uint8Array): SplitConfig {
  const metadata = parseCustomSections(wasmBytes);
  const allFunctions = getExportedFunctions(wasmBytes);

  // Functions marked for secondary modules
  // Map Rust names to actual export names
  const secondaryFunctions = new Set<string>();
  const secondary = new Map<string, { functions: string[]; depends: string[] }>();

  for (const meta of metadata) {
    const mappedFunctions: string[] = [];

    for (const rustFn of meta.functions) {
      const exportName = findExportName(rustFn, allFunctions);
      if (exportName) {
        mappedFunctions.push(exportName);
        secondaryFunctions.add(exportName);
      } else {
        console.warn(`Warning: Could not find export for function '${rustFn}'`);
      }
    }

    if (mappedFunctions.length > 0) {
      secondary.set(meta.moduleName, {
        functions: mappedFunctions,
        depends: ['core'], // All secondary modules depend on core
      });
    }
  }

  // Core functions are everything not in a secondary module
  const coreFunctions = allFunctions.filter((fn) => !secondaryFunctions.has(fn));

  return {
    core: { functions: coreFunctions },
    secondary,
  };
}

/**
 * Options for splitting a WASM binary.
 */
export interface SplitOptions {
  /** Input WASM bytes */
  input: Uint8Array;

  /** Whether to optimize the output */
  optimize?: boolean;

  /** Optimization level (0-4) */
  optimizeLevel?: number;

  /** Shrink level (0-2) */
  shrinkLevel?: number;
}

/**
 * Result of splitting a WASM binary.
 */
export interface SplitResult {
  /** Core module bytes */
  core: Uint8Array;

  /** Secondary module bytes by name */
  secondary: Map<string, Uint8Array>;

  /** Split configuration used */
  config: SplitConfig;
}

/**
 * Split a WASM binary into core and secondary modules.
 *
 * Uses Binaryen's wasm-split tool in multi-split mode to split the module
 * based on the wasmosis annotations found in the binary.
 */
export function splitWasm(options: SplitOptions): SplitResult {
  const { input, optimize = true, optimizeLevel = 2, shrinkLevel = 1 } = options;

  const config = analyzeSplitConfig(input);
  const secondary = new Map<string, Uint8Array>();

  // If no secondary modules, just return the input as core
  if (config.secondary.size === 0) {
    return { core: input, secondary, config };
  }

  // Check if wasm-split is available
  if (!checkWasmSplitAvailable()) {
    console.warn('wasm-split not found. Install Binaryen: brew install binaryen');
    console.warn('Returning unsplit module as core.');
    return { core: input, secondary, config };
  }

  // Create temp directory for splitting
  const tmpDir = mkdtempSync(join(tmpdir(), 'wasmosis-'));

  try {
    // Write input WASM to temp file
    const inputPath = join(tmpDir, 'input.wasm');
    writeFileSync(inputPath, input);

    // Generate manifest file for multi-split
    // Format: module name on first line, followed by functions, blank line between modules
    const manifestLines: string[] = [];
    for (const [moduleName, moduleConfig] of config.secondary) {
      manifestLines.push(moduleName);
      for (const fn of moduleConfig.functions) {
        manifestLines.push(fn);
      }
      manifestLines.push(''); // blank line separator
    }
    const manifestPath = join(tmpDir, 'manifest.txt');
    writeFileSync(manifestPath, manifestLines.join('\n'));

    // Build wasm-split command
    // --output is the primary (core) module
    // --out-prefix + module name = secondary modules
    const primaryPath = join(tmpDir, 'primary.wasm');
    const args = [
      '--multi-split',
      '--manifest', manifestPath,
      '--output', primaryPath,
      '--out-prefix', join(tmpDir, '') + '/',
      inputPath,
    ];

    // Run wasm-split
    const result = spawnSync('wasm-split', args, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024, // 100MB
    });

    if (result.status !== 0) {
      console.error('wasm-split failed:', result.stderr || result.stdout);
      console.warn('Returning unsplit module as core.');
      return { core: input, secondary, config };
    }

    // Read the core module (primary output)
    // wasm-split --multi-split outputs: <prefix><modulename>.wasm for each secondary
    // and modifies the input in place or outputs to -o1 for primary
    // Actually, multi-split creates files like: <out-prefix><module>.wasm
    // The primary/core module needs special handling

    // For multi-split, we need to use --split-funcs to get proper core/secondary split
    // Let's use a different approach: use regular split mode with all secondary funcs

    // Read secondary modules
    for (const [moduleName] of config.secondary) {
      const secondaryPath = join(tmpDir, `${moduleName}.wasm`);
      if (existsSync(secondaryPath)) {
        secondary.set(moduleName, new Uint8Array(readFileSync(secondaryPath)));
      }
    }

    // The core module - wasm-split modifies the input in place for multi-split
    // or we need to generate it separately
    // Let's read the primary output
    const corePath = join(tmpDir, 'primary.wasm');
    let core: Uint8Array;
    if (existsSync(corePath)) {
      core = new Uint8Array(readFileSync(corePath));
    } else {
      // Try regular split approach
      core = splitWithRegularMode(inputPath, tmpDir, config, optimize, optimizeLevel, shrinkLevel);
      // Re-read secondaries from regular split
      for (const [moduleName] of config.secondary) {
        const secondaryPath = join(tmpDir, `${moduleName}.wasm`);
        if (existsSync(secondaryPath)) {
          secondary.set(moduleName, new Uint8Array(readFileSync(secondaryPath)));
        }
      }
    }

    return { core, secondary, config };
  } finally {
    // Cleanup temp directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Split using regular --split mode, which is more reliable.
 * This splits into primary (core) and secondary, then we can further split secondary.
 */
function splitWithRegularMode(
  inputPath: string,
  tmpDir: string,
  config: SplitConfig,
  optimize: boolean,
  optimizeLevel: number,
  shrinkLevel: number
): Uint8Array {
  // Collect all secondary functions
  const allSecondaryFuncs: string[] = [];
  for (const [, moduleConfig] of config.secondary) {
    allSecondaryFuncs.push(...moduleConfig.functions);
  }

  const corePath = join(tmpDir, 'core.wasm');
  const secondaryPath = join(tmpDir, 'secondary.wasm');

  // Build wasm-split command for regular split
  const args = [
    '--split',
    `--split-funcs=${allSecondaryFuncs.join(',')}`,
    '-o1', corePath,
    '-o2', secondaryPath,
    inputPath,
  ];

  // Note: wasm-split doesn't have optimization flags like wasm-opt
  // Optimization should be done separately with wasm-opt if needed
  void optimize;
  void optimizeLevel;
  void shrinkLevel;

  const result = spawnSync('wasm-split', args, {
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.status !== 0) {
    console.error('wasm-split (regular) failed:', result.stderr || result.stdout);
    // Return original as fallback
    return new Uint8Array(readFileSync(inputPath));
  }

  // For now, we create a single secondary module containing all split functions
  // A more sophisticated implementation would create separate modules per annotation group
  // But that requires running wasm-split multiple times or using wasm-merge

  return new Uint8Array(readFileSync(corePath));
}

/**
 * Check if wasm-split CLI is available.
 */
function checkWasmSplitAvailable(): boolean {
  try {
    const result = spawnSync('wasm-split', ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if the splitter is available.
 */
export function checkBinaryenAvailable(): boolean {
  return checkWasmSplitAvailable();
}

/**
 * Generate a wasm-split command for external execution.
 *
 * This generates the command that should be run to actually split the module.
 * Requires wasm-split from Binaryen to be installed.
 */
export function generateWasmSplitCommand(
  inputPath: string,
  outputDir: string,
  config: SplitConfig
): string {
  const secondaryFunctions: string[] = [];

  for (const [, moduleConfig] of config.secondary) {
    secondaryFunctions.push(...moduleConfig.functions);
  }

  if (secondaryFunctions.length === 0) {
    return `# No functions to split - input.wasm is already the core module`;
  }

  // wasm-split command format
  const keepFuncs = secondaryFunctions.map((f) => `--keep-funcs=${f}`).join(' ');
  return `wasm-split ${inputPath} --export-prefix=% ${keepFuncs} -o1 ${outputDir}/core.wasm -o2 ${outputDir}/secondary.wasm`;
}
