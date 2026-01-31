# vcad Feature Documentation

Product management source of truth for vcad features. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to write and maintain feature specs.

## Feature Index

### Core Modeling (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Primitives](./primitives.md) | `shipped` | p0 | Box, cylinder, sphere, cone |
| [Boolean Operations](./boolean-operations.md) | `shipped` | p0 | Union, difference, intersection |
| [Transforms](./transforms.md) | `shipped` | p0 | Translate, rotate, scale |
| [Patterns](./patterns.md) | `shipped` | p0 | Linear and circular arrays |
| [Shell Operation](./shell-operation.md) | `shipped` | p0 | Hollow out solids |

### Sketch System (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Sketch Mode](./sketch-mode.md) | `shipped` | p0 | 2D drawing with constraints |
| [Sketch Operations](./sketch-operations.md) | `shipped` | p0 | Extrude, revolve, sweep, loft |

### Surface Operations (Partial)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Fillets & Chamfers](./fillets-chamfers.md) | `partial` | p1 | Kernel done, needs UI |

### Assembly (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Assembly & Joints](./assembly-joints.md) | `shipped` | p0 | Parts, instances, 5 joint types, FK |

### Technical Drawing (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [2D Drafting](./drafting-2d.md) | `shipped` | p0 | Projections, dimensions, GD&T |

### Import/Export (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Import/Export](./import-export.md) | `shipped` | p0 | STEP, STL, GLB |
| [Headless API](./headless-api.md) | `shipped` | p1 | CLI, MCP server |

### Visualization (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Viewport & Camera](./viewport-camera.md) | `shipped` | p0 | 3D navigation, gizmo, snaps |
| [Ray Tracing](./ray-tracing.md) | `shipped` | p1 | Direct BRep rendering |
| [Materials](./materials.md) | `shipped` | p1 | PBR materials |

### UI & Interaction (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Selection](./selection.md) | `shipped` | p0 | Multi-part selection |
| [Command Palette](./command-palette.md) | `shipped` | p1 | Quick command access |
| [Undo/Redo](./undo-redo.md) | `shipped` | p0 | 50-step history |

### Data & Storage (Shipped)

| Feature | Status | Priority | Spec |
|---------|--------|----------|------|
| [Document Persistence](./document-persistence.md) | `shipped` | p0 | Offline-first .vcad files |

---

## Foundation (Critical)

Technical debt and infrastructure that must be addressed before major features.

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Technical Debt Cleanup](./technical-debt.md) | `in-progress` | p0 | s | Safety fixes, module refactoring |
| [Compact IR Format](./compact-ir.md) | `proposed` | p0 | xs | Terse text format for AI/compression |

---

## AI-Native Features (Proposed)

Category-defining AI capabilities that no competitor offers.

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Text-to-CAD (cad0)](./text-to-cad.md) | `proposed` | p0 | xl | Natural language → parametric CAD |

---

## Robotics & Simulation (Planned)

Robotics interoperability and physics simulation.

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [URDF Import/Export](./urdf-support.md) | `proposed` | p1 | s | Standard robotics format |
| [Physics Simulation & Gym](./physics-simulation.md) | `planned` | p2 | l | Rapier physics, RL training |

---

## Feature Tree UX Improvements (Proposed)

Make vcad's feature tree legendary — better than SolidWorks, Fusion, Onshape.

### Tier 1: Highest Impact

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Hover Preview](./hover-preview.md) | `proposed` | p1 | s | Hover → highlight in viewport |
| [Timeline Scrubber](./timeline-scrubber.md) | `proposed` | p1 | m | Scrub through feature history |

### Tier 2: Feels Magical

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Smart Auto-Names](./smart-auto-names.md) | `proposed` | p1 | s | "Ø5 Hole" not "Cut-Extrude1" |

### Tier 3: Dependency Awareness

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Dependency Visualization](./dependency-visualization.md) | `proposed` | p2 | m | Show "↓3" badges, warnings |

### Tier 4: Removes Friction

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Inline Parameter Editing](./inline-parameter-editing.md) | `proposed` | p2 | m | Edit params in tree |

### Tier 5: Power User Features

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Keyboard Navigation](./keyboard-navigation.md) | `proposed` | p2 | s | j/k vim-style navigation |
| [Search & Filter](./search-filter.md) | `proposed` | p2 | s | Type to filter features |
| [Drag-Drop Reordering](./drag-drop-reordering.md) | `proposed` | p3 | m | Reorder with impact preview |
| [Feature Grouping](./feature-grouping.md) | `proposed` | p3 | s | Organize into folders |

### Tier 6: AI Differentiator

| Feature | Status | Priority | Effort | Spec |
|---------|--------|----------|--------|------|
| [Health & Intelligence](./health-intelligence.md) | `proposed` | p3 | l | Warnings, dead features, hints |

---

## Implementation Priority

### Now (Week 1-2)

1. **[Technical Debt Cleanup](./technical-debt.md)** — Safety fixes, boolean refactor (BLOCKING)
2. **[Compact IR Format](./compact-ir.md)** — Parser/serializer for cad0 (2-3 days)

### Next (Week 3-9)

3. **[URDF Import/Export](./urdf-support.md)** — Opens robotics market (1 week)
4. **[Text-to-CAD (cad0)](./text-to-cad.md)** — THE hero feature (7 weeks)

### Later (After cad0)

5. **[Fillets & Chamfers UI](./fillets-chamfers.md)** — Kernel done, needs UI
6. **Feature Tree UX** — Hover preview, smart names, timeline scrubber
7. **[Physics Simulation](./physics-simulation.md)** — Wait for user demand

### Future (From ROADMAP.md)

See [ROADMAP.md](./ROADMAP.md) for:
- Point Cloud → CAD
- PCB Integration
- Real-time Collaboration (CRDT)
- Topology Optimization

---

## Quick Stats

| Category | Shipped | In Progress | Proposed | Planned |
|----------|---------|-------------|----------|---------|
| Core Modeling | 5 | 0 | 0 | 0 |
| Sketch System | 2 | 0 | 0 | 0 |
| Surface Ops | 0 | 0 | 1 | 0 |
| Assembly | 1 | 0 | 0 | 0 |
| Drafting | 1 | 0 | 0 | 0 |
| Import/Export | 2 | 0 | 0 | 0 |
| Visualization | 3 | 0 | 0 | 0 |
| UI/Interaction | 3 | 0 | 0 | 0 |
| Data/Storage | 1 | 0 | 0 | 0 |
| Foundation | 0 | 1 | 1 | 0 |
| AI-Native | 0 | 0 | 1 | 0 |
| Feature Tree UX | 0 | 0 | 10 | 0 |
| Robotics | 0 | 0 | 1 | 1 |
| **Total** | **18** | **1** | **14** | **1** |
