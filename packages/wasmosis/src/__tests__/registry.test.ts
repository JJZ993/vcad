/**
 * Unit tests for wasmosis registry and module loading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Registry, createRegistry, defineModule } from '../index.js';
import type { WasmExports, ModuleDefinition } from '../types.js';
import { topologicalSort, validateGraph, getDependents } from '../graph.js';

// Mock WASM modules for testing
function createMockWasmBytes(): ArrayBuffer {
  // Minimal valid WASM module (magic + version + empty)
  const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic: \0asm
    0x01, 0x00, 0x00, 0x00, // version: 1
  ]);
  return bytes.buffer;
}

function createMockModule(
  name: string,
  depends: string[] = []
): ModuleDefinition<WasmExports> {
  return defineModule({
    name,
    loader: vi.fn().mockResolvedValue(createMockWasmBytes()),
    depends: depends.length > 0 ? depends : undefined,
  });
}

describe('defineModule', () => {
  it('creates a module definition', () => {
    const loader = vi.fn();
    const mod = defineModule({
      name: 'test',
      loader,
      depends: ['core'],
    });

    expect(mod.name).toBe('test');
    expect(mod.loader).toBe(loader);
    expect(mod.depends).toEqual(['core']);
  });

  it('handles optional depends', () => {
    const mod = defineModule({
      name: 'test',
      loader: vi.fn(),
    });

    expect(mod.depends).toBeUndefined();
  });
});

describe('topologicalSort', () => {
  it('sorts independent modules', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['a', createMockModule('a')],
      ['b', createMockModule('b')],
    ]);

    expect(topologicalSort(modules, 'a')).toEqual(['a']);
    expect(topologicalSort(modules, 'b')).toEqual(['b']);
  });

  it('sorts dependent modules', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['core', createMockModule('core')],
      ['step', createMockModule('step', ['core'])],
    ]);

    expect(topologicalSort(modules, 'step')).toEqual(['core', 'step']);
  });

  it('handles deep dependencies', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['a', createMockModule('a')],
      ['b', createMockModule('b', ['a'])],
      ['c', createMockModule('c', ['b'])],
      ['d', createMockModule('d', ['c'])],
    ]);

    expect(topologicalSort(modules, 'd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('handles multiple dependencies', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['core', createMockModule('core')],
      ['math', createMockModule('math', ['core'])],
      ['step', createMockModule('step', ['core', 'math'])],
    ]);

    const order = topologicalSort(modules, 'step');
    expect(order).toContain('core');
    expect(order).toContain('math');
    expect(order).toContain('step');
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('math'));
    expect(order.indexOf('math')).toBeLessThan(order.indexOf('step'));
  });

  it('detects circular dependencies', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['a', createMockModule('a', ['b'])],
      ['b', createMockModule('b', ['a'])],
    ]);

    expect(() => topologicalSort(modules, 'a')).toThrow('Circular dependency');
  });

  it('throws on unknown module', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['a', createMockModule('a')],
    ]);

    expect(() => topologicalSort(modules, 'unknown')).toThrow('Unknown module');
  });
});

describe('validateGraph', () => {
  it('validates valid graph', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['core', createMockModule('core')],
      ['step', createMockModule('step', ['core'])],
    ]);

    expect(validateGraph(modules)).toEqual({ valid: true });
  });

  it('detects missing dependency', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['step', createMockModule('step', ['core'])],
    ]);

    const result = validateGraph(modules);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.error).toContain('unknown module');
  });

  it('detects circular dependency', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['a', createMockModule('a', ['b'])],
      ['b', createMockModule('b', ['a'])],
    ]);

    const result = validateGraph(modules);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.error).toContain('Circular');
  });
});

describe('getDependents', () => {
  it('finds direct dependents', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['core', createMockModule('core')],
      ['step', createMockModule('step', ['core'])],
      ['drafting', createMockModule('drafting', ['core'])],
    ]);

    const dependents = getDependents(modules, 'core');
    expect(dependents).toContain('step');
    expect(dependents).toContain('drafting');
    expect(dependents.size).toBe(2);
  });

  it('finds transitive dependents', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['core', createMockModule('core')],
      ['math', createMockModule('math', ['core'])],
      ['step', createMockModule('step', ['math'])],
    ]);

    const dependents = getDependents(modules, 'core');
    expect(dependents).toContain('math');
    expect(dependents).toContain('step');
  });

  it('returns empty set for leaf modules', () => {
    const modules = new Map<string, ModuleDefinition>([
      ['core', createMockModule('core')],
      ['step', createMockModule('step', ['core'])],
    ]);

    const dependents = getDependents(modules, 'step');
    expect(dependents.size).toBe(0);
  });
});

describe('Registry', () => {
  let mockInstantiate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock WebAssembly.instantiate
    const mockMemory = new WebAssembly.Memory({ initial: 1 });
    const mockExports = {
      memory: mockMemory,
    };

    mockInstantiate = vi.fn().mockResolvedValue({
      instance: {
        exports: mockExports,
      },
    });

    // @ts-expect-error - Mocking global
    globalThis.WebAssembly = {
      ...WebAssembly,
      instantiate: mockInstantiate,
      Memory: WebAssembly.Memory,
      Table: WebAssembly.Table,
      Global: WebAssembly.Global,
    };
  });

  it('creates registry from module definitions', () => {
    const core = createMockModule('core');
    const registry = createRegistry({ core });

    expect(registry.getModuleNames()).toEqual(['core']);
    expect(registry.isLoaded('core')).toBe(false);
  });

  it('throws on invalid dependency graph', () => {
    const step = createMockModule('step', ['missing']);

    expect(() => createRegistry({ step })).toThrow('Invalid module graph');
  });

  it('loads a module', async () => {
    const core = createMockModule('core');
    const registry = createRegistry({ core });

    const module = await registry.load('core');

    expect(module).toBeDefined();
    expect(module.exports.memory).toBeInstanceOf(WebAssembly.Memory);
    expect(registry.isLoaded('core')).toBe(true);
  });

  it('deduplicates concurrent loads', async () => {
    const loader = vi.fn().mockResolvedValue(createMockWasmBytes());
    const core = defineModule({ name: 'core', loader });
    const registry = createRegistry({ core });

    // Start multiple loads concurrently
    const promise1 = registry.load('core');
    const promise2 = registry.load('core');
    const promise3 = registry.load('core');

    // All should return the same module
    const [m1, m2, m3] = await Promise.all([promise1, promise2, promise3]);

    expect(m1).toBe(m2);
    expect(m2).toBe(m3);

    // Loader should only be called once
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('returns cached module on subsequent loads', async () => {
    const loader = vi.fn().mockResolvedValue(createMockWasmBytes());
    const core = defineModule({ name: 'core', loader });
    const registry = createRegistry({ core });

    const module1 = await registry.load('core');
    const module2 = await registry.load('core');

    expect(module1).toBe(module2);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('throws on unknown module', async () => {
    const core = createMockModule('core');
    const registry = createRegistry({ core });

    await expect(registry.load('unknown')).rejects.toThrow('Unknown module');
  });

  it('preloads multiple modules', async () => {
    const core = createMockModule('core');
    const step = createMockModule('step', ['core']);
    const drafting = createMockModule('drafting', ['core']);
    const registry = createRegistry({ core, step, drafting });

    await registry.preload(['step', 'drafting']);

    expect(registry.isLoaded('core')).toBe(true);
    expect(registry.isLoaded('step')).toBe(true);
    expect(registry.isLoaded('drafting')).toBe(true);
  });

  it('reports loading state correctly', async () => {
    let resolveLoader: (value: ArrayBuffer) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<ArrayBuffer>((resolve) => {
        resolveLoader = resolve;
      })
    );
    const core = defineModule({ name: 'core', loader });
    const registry = createRegistry({ core });

    expect(registry.isLoading('core')).toBe(false);

    const loadPromise = registry.load('core');

    expect(registry.isLoading('core')).toBe(true);

    resolveLoader!(createMockWasmBytes());
    await loadPromise;

    expect(registry.isLoading('core')).toBe(false);
    expect(registry.isLoaded('core')).toBe(true);
  });

  it('caches and rethrows errors', async () => {
    const error = new Error('Load failed');
    const loader = vi.fn().mockRejectedValue(error);
    const core = defineModule({ name: 'core', loader });
    const registry = createRegistry({ core });

    await expect(registry.load('core')).rejects.toThrow('Load failed');
    await expect(registry.load('core')).rejects.toThrow('Load failed');

    // Should not retry
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('provides module state', () => {
    const core = createMockModule('core');
    const registry = createRegistry({ core });

    const state = registry.getState('core');
    expect(state).toEqual({ status: 'unloaded' });
  });
});
