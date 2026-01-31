# vcad Strategic Roadmap

## Vision

**Replace Fusion 360 / CATIA / NX / Onshape / Shapr3D / FreeCAD** with a free, open-source, AI-native parametric CAD ecosystem. Native apps + web + API + plugins.

The first CAD system where:
- You can **describe** what you want in natural language
- **AI suggests** constraints, features, and manufacturing fixes
- **Collaboration** is real-time without cloud lock-in
- **PCB and MCAD** are unified in one tool
- **Anyone can contribute** to the kernel (open source)
- It runs **anywhere** — browser, CLI, mobile, embedded
- It's **free forever**

This isn't incremental improvement. This is **category creation**.

---

## Current State

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Topology + Geometry + Primitives + Tessellation | ✅ |
| 2 | Boolean Operations | ✅ |
| 3 | Surface Transforms | ✅ |
| 4 | NURBS | ✅ |
| 5 | Fillets & Chamfers | ✅ |
| 6 | Sketch-Based Operations (extrude/revolve) | ✅ |
| 7 | Sketch IR + UI Integration | ✅ |
| 8 | Shell + Pattern Operations | ✅ |
| 9 | Constraint Solver | ✅ |
| 10 | STEP Import/Export | ✅ |
| 11 | Sweep + Loft (Kernel) | ✅ |
| 12 | Sweep + Loft UI Integration | ✅ |
| 13 | Assembly + Joints | ✅ |
| 14 | 2D Drafting | ✅ |
| 15 | Headless Mode + API | ✅ |

**Kernel crates:** math, topo, geom, primitives, tessellate, booleans, nurbs, fillet, sketch, sweep, shell, constraints, step, drafting

**Kernel stats:** ~29K lines Rust, ~5.4K lines in booleans alone

**App features:**
- React + Three.js viewport
- Parametric DAG with undo/redo
- Feature tree with part hierarchy
- Property panel with scrub inputs
- Sketch mode with constraint UI (horizontal, vertical, length, parallel, equal)
- Extrude, Revolve, Sweep, Loft operations
- Shell and pattern operations
- Boolean operations (union, difference, intersection)
- Assembly mode with instances, joints, and forward kinematics
- 2D drawing mode with orthographic projections

**Export:** STL, GLB, STEP, USD, DXF | **Import:** .vcad, STEP

**Headless:** Rust CLI (`vcad export/import-step/info`), JS CLI (TUI), MCP server (`create_cad_document`, `export_cad`, `inspect_cad`)

---

## The Five Legendary Pillars

### 1. AI-Native CAD (No competitor has this)

| Feature | Research | Impact |
|---------|----------|--------|
| **Text-to-CAD** | CAD-MLLM [2411.04954], CAD-Recode [2412.14042] | "Design a flange with 6 holes" → parametric model |
| **Point Cloud → CAD** | P2CADNet [2310.02638], Point2Primitive [2505.02043] | 3D scan → editable B-rep |
| **Sketch Completion** | SketchAgent [2411.17673], CurveGen [2104.09621] | Underconstrained sketch → AI suggests constraints |
| **Manufacturing AI** | Physics-Informed ML [2407.10761], Agentic AM [2510.02567] | "Is this printable?" with suggested modifications |

**Implementation:** Integrate `burn` (Rust ML framework) for on-device inference. MCP server is already the perfect interface.

### 2. Bulletproof Robustness (Beat Parasolid)

| Problem | Solution | Paper |
|---------|----------|-------|
| Boolean failures | Exact predicates | Shewchuk's adaptive arithmetic |
| Trim curve gaps | Watertightization | [2402.10216] |
| Containment edge cases | GWN queries | [2504.11435] |
| Mesh self-intersection | Interactive booleans | [2205.14151] — 200K tris at 30fps |

**Already integrated:** 5 arXiv papers on boolean robustness (see `/docs/research/`)

### 3. Real-Time Collaboration (Beat Onshape)

| Component | Technology | Paper |
|-----------|------------|-------|
| Document sync | **CRDTs** | Collabs [2212.02618] — 100+ simultaneous users |
| Conflict resolution | Operational Transform | [1905.01517] real-world analysis |
| Presence | WebSocket + Y.js | — |

**Advantage:** vcad's DAG-based document model is already CRDT-friendly. Unlike Onshape's server-round-trip, vcad can do local-first with eventual consistency.

### 4. Topology Optimization (Beat Fusion's generative design)

| Method | Use Case | Paper |
|--------|----------|-------|
| SIMP | Structural optimization | [1009.4975] dynamic adaptive mesh |
| Lattice structures | Lightweighting | [2303.03866] fillet-aware lattices |
| RL-guided | Diverse designs | [2008.07119] reinforcement learning |
| Multi-scale | Graded materials | [2303.08710] buckling-aware |

**Implementation path:**
1. Voxelize B-rep → density field
2. FEA on density field (integrate `nalgebra-sparse`)
3. SIMP iteration → updated density
4. Marching cubes → mesh → B-rep reconstruction

### 5. GPU-Accelerated Everything (10-100x speedup)

| Operation | GPU Method | Expected Speedup |
|-----------|------------|------------------|
| **Direct BRep ray tracing** | Ray-trace analytic surfaces, skip tessellation | ∞ quality |
| NURBS evaluation | De Boor on compute shader | 50x |
| Boolean SSI | Parallel face-pairs via `wgpu` | 20x |
| Tessellation | Hardware tessellator | 100x |
| Collision detection | BVH on GPU | 30x |

**Rust stack:** `wgpu` for WebGPU/Vulkan, `rayon` for CPU parallelism

#### Direct BRep Ray Tracing (Revolutionary)

Instead of tessellating BRep → triangles → rasterize, ray-trace the actual surfaces:

```
Planes      → closed-form ray-plane intersection
Cylinders   → quadratic solve
Spheres     → quadratic solve
Cones       → quadratic solve
Tori        → quartic solve (Ferrari's method)
NURBS       → Newton iteration on ray-surface
```

**Benefits:**
- **Pixel-perfect silhouettes** at any zoom level (no faceting ever)
- **No tessellation latency** when parameters change — instant feedback
- **Exact edge display** — the #1 visual quality complaint about CAD software
- **LOD-free** — same quality at 1000x zoom as at 1x

**Implementation:**
1. Build BVH over BRep faces (AABB hierarchy)
2. WebGPU compute shader traces rays against analytic surfaces
3. Trimmed surfaces use 2D point-in-region test on parameter space
4. Fall back to tessellation only for degenerate cases

**Why this beats everyone:** No commercial CAD does this. They all tessellate. This is a generational leap in visual quality.

---

## Phase 19: PCB Design (Unified MCAD-ECAD)

**Goal:** First-class PCB design integrated with mechanical CAD.

No tool does this well:
- Design enclosure in vcad → auto-place mounting holes for PCB
- Define thermal zones → route high-power traces away
- Mechanical interference checking with assembled PCB

### PCB Architecture

```
vcad-pcb/
├── crates/
│   ├── vcad-pcb-ir/           # PCB intermediate representation
│   │   ├── component.rs       # Footprints, pads, pins
│   │   ├── net.rs             # Netlist, connections
│   │   ├── layer.rs           # Stackup, copper layers
│   │   └── rules.rs           # Design rules (clearance, width)
│   ├── vcad-pcb-router/       # Autorouting engine
│   │   ├── astar.rs           # Pathfinding
│   │   ├── congestion.rs      # Congestion-aware routing
│   │   └── differential.rs    # Differential pair routing
│   ├── vcad-pcb-placer/       # Component placement
│   │   ├── force_directed.rs  # Force-directed placement
│   │   └── ml_placer.rs       # ML-based placement
│   └── vcad-pcb-drc/          # Design rule checking
│       ├── clearance.rs       # Copper clearance
│       └── manufacturing.rs   # Fab constraints
└── packages/
    └── pcb-engine/            # WASM binding for web app
```

### PCB Research

| Feature | Algorithm | Paper |
|---------|-----------|-------|
| **Auto-routing** | A* with congestion awareness | [2303.01648] |
| **Placement optimization** | AI chip placement | [2407.15026] ChiPBench |
| **DRC** | Constraint propagation | GPU solvers [2207.12116] |
| **Defect detection** | ChangeChip | [2109.05746] |
| **Nanomodular routing** | Algorithmic tradeoffs | [2510.03126] — 108x speedup |

---

## Competitive Matrix (Post-Implementation)

| Feature | Fusion | CATIA | NX | Onshape | Shapr3D | FreeCAD | **vcad** |
|---------|--------|-------|-----|---------|---------|---------|----------|
| AI Text-to-CAD | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Point Cloud → CAD | 🔶 | 🔶 | 🔶 | ❌ | ❌ | ❌ | **✅** |
| Generative Design | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | **✅** |
| Real-Time Collab | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | **✅** |
| Local-First | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | **✅** |
| Open Source | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **✅** |
| API-First | 🔶 | ❌ | ❌ | ✅ | ❌ | 🔶 | **✅** |
| PCB Integration | 🔶 | ❌ | ❌ | ❌ | ❌ | 🔶 | **✅** |
| GPU Acceleration | ❌ | ❌ | 🔶 | ❌ | ❌ | ❌ | **✅** |
| Direct BRep Rendering | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Self-Hosted | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **✅** |
| Price | $$$$ | $$$$$ | $$$$$ | $$$ | $$ | Free | **Free** |

---

## Research-to-Implementation Priorities

### Phase A: Robustness Foundation (Now)
1. **Exact predicates** for boolean operations — Shewchuk's adaptive arithmetic
2. ✅ **Parallel boolean pipeline** with `rayon` — 7-8% improvement on cylinder ops
3. ✅ **Performance benchmarking** suite — criterion benchmarks for all pipeline stages

### Phase B: AI Core (Q2)
4. **CAD-MLLM integration** — text/image → parametric CAD
5. **Sketch constraint inference** — ML-based suggestion
6. **P2CADNet** — point cloud reconstruction

### Phase C: PCB MVP (Q3)
7. **PCB IR types** — components, nets, layers
8. **Basic autorouter** — A* with congestion
9. **KiCad import** — leverage existing designs

### Phase D: Performance (Q4)
10. **Direct BRep ray tracing** — WebGPU renderer for analytic surfaces (pixel-perfect, no tessellation)
11. **GPU tessellation** — wgpu compute shaders (fallback for complex NURBS)
12. **CRDT collaboration** — Collabs-inspired sync
13. **Topology optimization** — SIMP + marching cubes

---

## Key arXiv Papers to Implement

| Paper | ID | Category | Why |
|-------|-----|----------|-----|
| CAD-MLLM | 2411.04954 | AI | Multimodal CAD generation |
| CAD-Recode | 2412.14042 | AI | Point cloud → Python CAD code |
| P2CADNet | 2310.02638 | AI | End-to-end point cloud → CAD |
| Interactive Booleans | 2205.14151 | Kernel | 30fps on 200K triangles |
| Collabs CRDT | 2212.02618 | Collab | 100+ user collaboration |
| ChiPBench | 2407.15026 | PCB | AI chip/PCB placement |
| Nanomodular Routing | 2510.03126 | PCB | 108x routing speedup |
| Physics-Informed AM | 2407.10761 | DFM | Smart manufacturing |
| Body-and-CAD Rigidity | 1006.1126 | Kernel | Constraint theory foundation |
| BRT Transformer | 2504.07134 | AI | B-rep learning |
| FilletRec | 2511.05561 | AI | ML fillet detection |
| SketchAgent | 2411.17673 | AI | Language-driven sketching |

---

## Technical Architecture

### Kernel Design
- **Half-edge B-rep topology** (arena-based with `slotmap`)
- **Analytic surfaces:** Plane, Cylinder, Cone, Sphere, Bilinear patches
- **NURBS:** B-spline curves/surfaces with De Boor evaluation, rational NURBS
- **Trait-based geometry abstraction** (`Surface`, `Curve3d`, `Curve2d`)

### Constraint Solver
- **Algorithm:** Levenberg-Marquardt with adaptive damping (λ ∈ [1e-12, 1e12])
- **Jacobian:** Numerical via finite differences (opportunity: autodiff)
- **Constraints:** Coincident, Horizontal, Vertical, Parallel, Perpendicular, Tangent, Distance, Length, Radius, Angle, Equal Length, Fixed

### Boolean Pipeline (4-stage)
1. **AABB Filter** — Broadphase candidate detection
2. **Surface-Surface Intersection** — Analytic solutions + sampled fallback
3. **Face Classification** — Ray casting + winding number
4. **Sewing** — Trim, split, merge with topology repair

### Research Integration
vcad already incorporates arXiv research:
- [2310.10351] Post-boolean topology repair
- [2402.10216] Watertight trim handling
- [2504.11435, 2510.25159] Robust containment queries
- [2512.23719] Adaptive tessellation

---

## Phase Details

### Phase 10: STEP Import/Export ✅

**Complete:**
- Kernel crate `vcad-kernel-step` implements STEP AP214 read/write
- High-level API: `Part::from_step()`, `Part::from_step_all()`, `Part::to_step()`
- CLI: `vcad export input.vcad output.step` and `vcad import-step input.step output.vcad`
- CLI supports STL, GLB, and STEP export formats

**Remaining:**
- Web app STEP import UI (kernel support exists via WASM)

### Phase 13: Assembly + Joints ✅

**Complete:**
- Rust IR types: `Joint`, `JointKind`, `Instance`, `PartDef`, `Transform3D` with serde JSON compat
- TS IR types mirror Rust exactly
- Forward kinematics solver (`packages/engine/src/kinematics.ts`)
- Engine evaluates partDefs → meshes, applies kinematics to instances
- App UI: FeatureTree shows instances/joints, PropertyPanel has joint state sliders
- Assembly creation: `createPartDef`, `addJoint`, dialogs, toolbar buttons
- Document store: `setInstanceTransform`, `setInstanceMaterial`, `setJointState`

**Future:**
- Interference detection

### Phase 14: 2D Drafting ✅

**Complete:**
- Kernel crate `vcad-kernel-drafting` with full implementation
- Orthographic projection (Front, Top, Right, Back, Left, Bottom)
- Isometric projection
- Hidden line removal with depth-based classification
- Section views with hatch pattern generation
- Edge extraction (sharp edges, silhouette edges, boundary edges)
- Dimension annotations: Linear, Angular, Radial, Ordinate
- GD&T support: Feature control frames, datum symbols, material conditions
- Dimension styles with customizable fonts, arrows, tolerances
- App integration: DrawingView component, drawing-store, view direction toolbar

**Remaining:**
- Detail views (magnified regions)
- Notes, balloons, BOM generation
- DXF/PDF export of drawings

### Phase 15: Headless Mode + API ✅

**Complete:**
- Rust CLI: `vcad tui`, `vcad export` (STL/GLB/STEP), `vcad import-step`, `vcad info`
- JS CLI: TUI runner using Ink + @vcad/engine
- MCP server: `create_cad_document`, `export_cad` (STL/GLB), `inspect_cad`

**Remaining:**
- REST API for web services
- GitHub Actions integration
- Batch processing mode

### Phase 16: Plugin System

- Plugin API (Rust traits + WASM)
- Custom primitives, operations, exporters
- Plugin marketplace
- Example plugins: gear generator, thread creator, sheet metal

### Phase 17: Real-Time Collaboration

- CRDT-based document sync
- Presence indicators (cursors, selections)
- Comments on geometry
- Version history with branching

### Phase 18: AI-Assisted Design

- Natural language → sketch constraints
- "Make this fit inside a 100mm cube"
- Design suggestions based on manufacturing constraints
- Auto-fillet for printability

---

## Immediate Next Steps

### Performance (In Progress)
1. ✅ Add `rayon` to parallelize boolean face-pair processing (7-8% improvement)
2. ✅ Create criterion benchmark suite for booleans
3. Integrate Shewchuk's exact predicates for containment queries
4. GPU acceleration via wgpu for SSI computation
5. **Direct BRep ray tracing** — WebGPU compute shader renderer that ray-traces analytic surfaces (planes, cylinders, spheres, cones, tori, NURBS) instead of tessellating to triangles

### Web App Enhancements
1. STEP import UI in web app (kernel support exists)
2. Drawing export (DXF/PDF) from 2D drafting views
3. Detail views in drafting mode

### PCB Foundation
1. Create `vcad-pcb-ir` crate with component/net/layer types
2. Implement basic DRC (clearance checking)
3. KiCad footprint import

---

## The Moat

**Why vcad will win:**

1. **Open Research Loop** — We integrate SIGGRAPH/Eurographics/arXiv papers within weeks of publication. Commercial vendors take years.

2. **Rust Safety** — Memory safety eliminates entire class of kernel crashes that plague ACIS/Parasolid.

3. **AI-First Architecture** — MCP server enables Claude/GPT integration. No bolted-on AI features.

4. **Cloud-Native + Local-First** — WASM compilation enables browser CAD. No mandatory cloud dependency.

5. **Unified MCAD-ECAD** — First tool to properly integrate mechanical and electronic design.

6. **Community Velocity** — Open source means thousands of contributors vs. hundreds of employees.

The research exists. The architecture is clean. The moment is now.
