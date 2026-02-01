#!/usr/bin/env node

/**
 * wasmosis CLI - Split WASM modules for lazy loading
 *
 * Usage:
 *   wasmosis split input.wasm --out-dir ./dist
 *   wasmosis analyze input.wasm
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { splitWasm, analyzeSplitConfig, checkBinaryenAvailable } from './splitter.js';
import { generateBundle } from './codegen.js';

interface SplitArgs {
  input: string;
  outDir: string;
  optimize: boolean;
  optimizeLevel: number;
  shrinkLevel: number;
}

interface AnalyzeArgs {
  input: string;
  json: boolean;
}

function printUsage(): void {
  console.log(`wasmosis - Lazy WASM module splitting

Usage:
  wasmosis split <input.wasm> [options]
  wasmosis analyze <input.wasm> [options]
  wasmosis --help

Commands:
  split     Split a WASM binary into core and secondary modules
  analyze   Analyze a WASM binary for split configuration

Split Options:
  --out-dir, -o <dir>    Output directory (default: ./dist)
  --no-optimize          Disable optimization
  --optimize-level <n>   Optimization level 0-4 (default: 2)
  --shrink-level <n>     Shrink level 0-2 (default: 1)

Analyze Options:
  --json                 Output as JSON

Examples:
  wasmosis split kernel.wasm -o ./wasm
  wasmosis analyze kernel.wasm --json
`);
}

function parseSplitArgs(args: string[]): SplitArgs | null {
  if (args.length === 0) {
    console.error('Error: Missing input file');
    return null;
  }

  const result: SplitArgs = {
    input: args[0]!,
    outDir: './dist',
    optimize: true,
    optimizeLevel: 2,
    shrinkLevel: 1,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--out-dir':
      case '-o':
        result.outDir = args[++i] ?? './dist';
        break;
      case '--no-optimize':
        result.optimize = false;
        break;
      case '--optimize-level':
        result.optimizeLevel = parseInt(args[++i] ?? '2', 10);
        break;
      case '--shrink-level':
        result.shrinkLevel = parseInt(args[++i] ?? '1', 10);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        return null;
    }
  }

  return result;
}

function parseAnalyzeArgs(args: string[]): AnalyzeArgs | null {
  if (args.length === 0) {
    console.error('Error: Missing input file');
    return null;
  }

  const result: AnalyzeArgs = {
    input: args[0]!,
    json: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--json':
        result.json = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        return null;
    }
  }

  return result;
}

async function runSplit(args: SplitArgs): Promise<number> {
  if (!checkBinaryenAvailable()) {
    console.error('Error: Binaryen is not available. Install with: npm install binaryen');
    return 1;
  }

  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    return 1;
  }

  console.log(`Reading ${basename(inputPath)}...`);
  const input = new Uint8Array(readFileSync(inputPath));

  console.log(`Splitting WASM (${(input.length / 1024).toFixed(1)} KB)...`);
  const result = splitWasm({
    input,
    optimize: args.optimize,
    optimizeLevel: args.optimizeLevel,
    shrinkLevel: args.shrinkLevel,
  });

  // Create output directory
  const outDir = resolve(args.outDir);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // Write core module
  const corePath = join(outDir, 'core.wasm');
  writeFileSync(corePath, result.core);
  console.log(`  core.wasm (${(result.core.length / 1024).toFixed(1)} KB)`);

  // Write secondary modules
  for (const [name, bytes] of result.secondary) {
    const secondaryPath = join(outDir, `${name}.wasm`);
    writeFileSync(secondaryPath, bytes);
    console.log(`  ${name}.wasm (${(bytes.length / 1024).toFixed(1)} KB)`);
  }

  // Generate TypeScript code
  const bundle = generateBundle(result.config, {
    wasmBasePath: './',
    moduleFormat: 'esm',
  });

  const registryPath = join(outDir, 'registry.ts');
  writeFileSync(registryPath, bundle.registry);
  console.log(`  registry.ts`);

  const typesPath = join(outDir, 'types.d.ts');
  writeFileSync(typesPath, bundle.types);
  console.log(`  types.d.ts`);

  console.log(`\nSplit complete! ${1 + result.secondary.size} modules written to ${outDir}`);
  return 0;
}

async function runAnalyze(args: AnalyzeArgs): Promise<number> {
  if (!checkBinaryenAvailable()) {
    console.error('Error: Binaryen is not available. Install with: npm install binaryen');
    return 1;
  }

  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    return 1;
  }

  const input = new Uint8Array(readFileSync(inputPath));
  const config = analyzeSplitConfig(input);

  if (args.json) {
    const output = {
      core: {
        functions: config.core.functions,
        functionCount: config.core.functions.length,
      },
      secondary: Object.fromEntries(
        [...config.secondary.entries()].map(([name, cfg]) => [
          name,
          {
            functions: cfg.functions,
            functionCount: cfg.functions.length,
            depends: cfg.depends,
          },
        ])
      ),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`WASM Analysis: ${basename(inputPath)}`);
    console.log(`Size: ${(input.length / 1024).toFixed(1)} KB`);
    console.log('');
    console.log(`Core module:`);
    console.log(`  Functions: ${config.core.functions.length}`);
    if (config.core.functions.length <= 10) {
      for (const fn of config.core.functions) {
        console.log(`    - ${fn}`);
      }
    }
    console.log('');

    if (config.secondary.size === 0) {
      console.log('No secondary modules detected.');
      console.log('Add #[wasmosis::module("name")] to functions to enable splitting.');
    } else {
      console.log('Secondary modules:');
      for (const [name, cfg] of config.secondary) {
        console.log(`  ${name}:`);
        console.log(`    Functions: ${cfg.functions.length}`);
        console.log(`    Depends: ${cfg.depends.join(', ')}`);
        for (const fn of cfg.functions) {
          console.log(`      - ${fn}`);
        }
      }
    }
  }

  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return 0;
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case 'split': {
      const splitArgs = parseSplitArgs(commandArgs);
      if (!splitArgs) {
        printUsage();
        return 1;
      }
      return runSplit(splitArgs);
    }

    case 'analyze': {
      const analyzeArgs = parseAnalyzeArgs(commandArgs);
      if (!analyzeArgs) {
        printUsage();
        return 1;
      }
      return runAnalyze(analyzeArgs);
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
