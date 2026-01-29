/**
 * Binary STL export for 3D printing.
 *
 * Ported from crates/vcad/src/export/stl.rs
 */

import type { EvaluatedScene, TriangleMesh } from "@vcad/engine";

/** Convert evaluated scene to binary STL bytes. */
export function toStlBytes(scene: EvaluatedScene, name: string): Uint8Array {
  // Merge all parts into a single mesh for STL
  let totalTriangles = 0;
  for (const part of scene.parts) {
    totalTriangles += part.mesh.indices.length / 3;
  }

  // 80-byte header + 4-byte count + 50 bytes per triangle
  const buffer = new ArrayBuffer(84 + totalTriangles * 50);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  // Write header (80 bytes, padded with spaces)
  const header = name.slice(0, 80).padEnd(80, " ");
  for (let i = 0; i < 80; i++) {
    uint8[i] = header.charCodeAt(i);
  }

  // Write triangle count
  view.setUint32(80, totalTriangles, true);

  let offset = 84;

  for (const part of scene.parts) {
    offset = writeMeshTriangles(part.mesh, view, offset);
  }

  return uint8;
}

function writeMeshTriangles(
  mesh: TriangleMesh,
  view: DataView,
  offset: number,
): number {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const numTriangles = indices.length / 3;

  for (let t = 0; t < numTriangles; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    // Get vertices
    const v0x = positions[i0 * 3];
    const v0y = positions[i0 * 3 + 1];
    const v0z = positions[i0 * 3 + 2];
    const v1x = positions[i1 * 3];
    const v1y = positions[i1 * 3 + 1];
    const v1z = positions[i1 * 3 + 2];
    const v2x = positions[i2 * 3];
    const v2y = positions[i2 * 3 + 1];
    const v2z = positions[i2 * 3 + 2];

    // Calculate normal via cross product
    const e1x = v1x - v0x;
    const e1y = v1y - v0y;
    const e1z = v1z - v0z;
    const e2x = v2x - v0x;
    const e2y = v2y - v0y;
    const e2z = v2z - v0z;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-10) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    // Write normal (3 floats)
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    offset += 12;

    // Write vertices (3 * 3 floats)
    view.setFloat32(offset, v0x, true);
    view.setFloat32(offset + 4, v0y, true);
    view.setFloat32(offset + 8, v0z, true);
    offset += 12;

    view.setFloat32(offset, v1x, true);
    view.setFloat32(offset + 4, v1y, true);
    view.setFloat32(offset + 8, v1z, true);
    offset += 12;

    view.setFloat32(offset, v2x, true);
    view.setFloat32(offset + 4, v2y, true);
    view.setFloat32(offset + 8, v2z, true);
    offset += 12;

    // Attribute byte count (0)
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return offset;
}
