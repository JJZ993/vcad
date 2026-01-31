# CLAUDE.md

Instructions for AI agents working on vcad.

## Overview

vcad is an open-source parametric CAD system aiming to replace Fusion 360, Onshape, and similar tools. It features a custom BRep kernel written in Rust, a React/Three.js web app, and AI-native interfaces via MCP.

**Live app:** https://vcad.io

## Commands

```bash
# Rust
cargo test --workspace             # run all tests
cargo clippy --workspace -- -D warnings  # lint — must pass clean
cargo fmt --all --check            # formatting check
cargo build --workspace            # build everything

# TypeScript
npm ci                             # install deps
npm run build --workspaces         # build all TS packages
npm test --workspaces --if-present # run tests

# App
npm run dev -w @vcad/app           # run web app locally
```

## Architecture

```
vcad/
├── crates/                        # Rust workspace (~27K LOC)
│   ├── vcad-kernel-math/          # Linear algebra, transforms
│   ├── vcad-kernel-topo/          # Half-edge BRep topology
│   ├── vcad-kernel-geom/          # Curves and surfaces
│   ├── vcad-kernel-primitives/    # Box, cylinder, sphere, cone
│   ├── vcad-kernel-tessellate/    # BRep → triangle mesh
│   ├── vcad-kernel-booleans/      # Boolean operations (~5.4K LOC)
│   ├── vcad-kernel-nurbs/         # NURBS curves/surfaces
│   ├── vcad-kernel-fillet/        # Fillets and chamfers
│   ├── vcad-kernel-sketch/        # 2D sketch geometry
│   ├── vcad-kernel-constraints/   # Geometric constraint solver
│   ├── vcad-kernel-sweep/         # Sweep and loft operations
│   ├── vcad-kernel-shell/         # Shell and pattern ops
│   ├── vcad-kernel-step/          # STEP AP214 import/export
│   ├── vcad-kernel-drafting/      # 2D drawings, projections, GD&T
│   ├── vcad-kernel/               # Unified kernel API
│   ├── vcad-kernel-wasm/          # WASM bindings for browser
│   ├── vcad-ir/                   # Intermediate representation
│   ├── vcad-cli/                  # CLI tool
│   └── vcad/                      # Legacy CSG library (manifold-based)
├── packages/                      # TypeScript workspace
│   ├── app/                       # Web app (React + Three.js + Zustand)
│   ├── engine/                    # WASM engine wrapper
│   ├── ir/                        # TypeScript IR types
│   ├── core/                      # Shared utilities
│   ├── kernel-wasm/               # Kernel WASM package
│   ├── mcp/                       # MCP server for AI agents
│   ├── cli/                       # JS CLI (TUI)
│   └── docs/                      # Documentation site
└── web/                           # Landing page (vcad.io)
```

## Key Concepts

### BRep Kernel

The kernel uses **half-edge topology** (arena-based with `slotmap`) for boundary representation:

- **Vertex** → point in 3D
- **Edge** → curve segment between vertices
- **Face** → bounded surface region
- **Shell** → connected set of faces
- **Solid** → closed shell with volume

Surfaces: Plane, Cylinder, Cone, Sphere, Torus, NURBS

### Boolean Pipeline (4-stage)

1. **AABB Filter** — broadphase candidate detection
2. **Surface-Surface Intersection** — analytic + sampled fallback
3. **Face Classification** — ray casting + winding number
4. **Sewing** — trim, split, merge with topology repair

### Constraint Solver

Levenberg-Marquardt with adaptive damping. Constraints: Coincident, Horizontal, Vertical, Parallel, Perpendicular, Tangent, Distance, Length, Radius, Angle, Equal Length, Fixed.

### Web App

- **Viewport:** React Three Fiber with custom shaders
- **State:** Zustand stores (document, selection, UI)
- **Feature tree:** Hierarchical part/instance/joint view
- **Property panel:** Scrub inputs for parameters
- **Sketch mode:** 2D constraint UI
- **Assembly mode:** Instances, joints, forward kinematics
- **Drawing mode:** Orthographic projections, dimensions

### Document Format

`.vcad` files are JSON containing:
- Parametric DAG (operations reference parents)
- Part definitions and instances
- Joints with kinematic state
- Material assignments
- Sketches with constraints

## App Features

| Feature | Status |
|---------|--------|
| Primitives (box, cylinder, sphere, cone) | ✅ |
| Boolean operations | ✅ |
| Transforms (translate, rotate, scale, mirror) | ✅ |
| Patterns (linear, circular) | ✅ |
| Fillets and chamfers | ✅ |
| Sketch mode with constraints | ✅ |
| Extrude, Revolve, Sweep, Loft | ✅ |
| Shell operation | ✅ |
| Assembly with joints | ✅ |
| Forward kinematics | ✅ |
| 2D drafting views | ✅ |
| STEP import/export | ✅ |
| STL/GLB export | ✅ |
| Undo/redo | ✅ |

## Headless Interfaces

**Rust CLI:**
```bash
vcad export input.vcad output.stl   # Export to STL/GLB/STEP
vcad import-step input.step out.vcad
vcad info input.vcad                # Show document info
```

**MCP Server** (for AI agents):
- `create_cad_document` — create parts from primitives + operations
- `export_cad` — export to STL or GLB
- `inspect_cad` — get volume, area, bbox, center of mass

## Conventions

- `#![warn(missing_docs)]` on public items
- Tests in `#[cfg(test)] mod tests` at file bottom
- Units are `f64`, conventionally millimeters
- IR types use `#[serde(tag = "type")]` for JSON discrimination
- App components in `packages/app/src/components/`
- Stores in `packages/app/src/stores/`

## Adding Functionality

**New kernel feature:**
1. Add to appropriate `vcad-kernel-*` crate
2. Expose via `vcad-kernel` unified API
3. Add WASM bindings in `vcad-kernel-wasm`
4. Run `cargo test --workspace && cargo clippy --workspace -- -D warnings`

**New app feature:**
1. Add store logic in `packages/app/src/stores/`
2. Add UI components in `packages/app/src/components/`
3. Wire up in `App.tsx`
4. Run `npm run build -w @vcad/app`

**New IR operation:**
1. Add variant to `CsgOp` in `crates/vcad-ir/src/lib.rs`
2. Mirror in `packages/ir/src/index.ts`
3. Add evaluation logic in `packages/engine/src/evaluate.ts`
