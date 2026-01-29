# @vcad/mcp

MCP (Model Context Protocol) server for vcad CAD operations. Enables AI assistants like Claude Code, Cursor, and others to create, export, and inspect 3D geometry.

## Installation

```bash
npm install -g @vcad/mcp
```

Or add to your MCP configuration directly:

```bash
claude mcp add vcad --command "npx @vcad/mcp"
```

## Tools

### `create_cad_document`

Create a CAD document from structured geometry input.

**Input:**
```json
{
  "parts": [{
    "name": "plate",
    "primitive": { "type": "cube", "size": { "x": 100, "y": 50, "z": 5 } },
    "operations": [
      {
        "type": "difference",
        "primitive": { "type": "cylinder", "radius": 3, "height": 10 },
        "at": { "x": 10, "y": 10, "z": 0 }
      }
    ]
  }]
}
```

**Primitives:**
- `cube` - Box shape with `size: {x, y, z}`
- `cylinder` - Cylinder with `radius`, `height`, optional `segments`
- `sphere` - Sphere with `radius`, optional `segments`
- `cone` - Cone with `radius_bottom`, `radius_top`, `height`

**Operations:**
- `union` - Add geometry
- `difference` - Subtract geometry
- `intersection` - Keep only overlapping geometry
- `translate` - Move with `offset: {x, y, z}`
- `rotate` - Rotate with `angles: {x, y, z}` in degrees
- `scale` - Scale with `factor: {x, y, z}`
- `linear_pattern` - Repeat along `direction` with `count` and `spacing`
- `circular_pattern` - Repeat around axis with `axis_origin`, `axis_dir`, `count`, `angle_deg`

### `export_cad`

Export a CAD document to a file.

**Input:**
```json
{
  "ir": { /* document from create_cad_document */ },
  "filename": "plate.stl"
}
```

**Supported formats:**
- `.stl` - Binary STL for 3D printing
- `.glb` - Binary glTF for visualization

### `inspect_cad`

Get geometry properties from a CAD document.

**Input:**
```json
{
  "ir": { /* document from create_cad_document */ }
}
```

**Output:**
```json
{
  "volume_mm3": 1000,
  "surface_area_mm2": 600,
  "bounding_box": {
    "min": { "x": 0, "y": 0, "z": 0 },
    "max": { "x": 10, "y": 10, "z": 10 }
  },
  "center_of_mass": { "x": 5, "y": 5, "z": 5 },
  "triangles": 12,
  "parts": 1
}
```

## Example Usage

In Claude Code or another MCP-compatible assistant:

> "Create a 50x30x5mm plate with four 3mm mounting holes at the corners, spaced 5mm from each edge. Export to mounting_plate.stl"

The assistant will:
1. Use `create_cad_document` to build the geometry
2. Use `inspect_cad` to verify dimensions
3. Use `export_cad` to write the STL file

## Development

```bash
# Build
npm run build -w @vcad/mcp

# Test
npm test -w @vcad/mcp

# Run locally
node packages/mcp/dist/index.js
```
