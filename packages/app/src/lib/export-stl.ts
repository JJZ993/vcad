import type { EvaluatedScene } from "@vcad/engine";

/**
 * Export an evaluated scene as a binary STL blob.
 * Binary STL format:
 *   80 bytes header
 *   4 bytes (uint32) triangle count
 *   Per triangle (50 bytes):
 *     12 bytes normal (float32 x3)
 *     36 bytes vertices (float32 x3 x3)
 *     2 bytes attribute byte count (0)
 */
export function exportStl(scene: EvaluatedScene): Blob {
  // Count total triangles across all parts
  let totalTriangles = 0;
  for (const part of scene.parts) {
    totalTriangles += part.mesh.indices.length / 3;
  }

  const bufferSize = 80 + 4 + totalTriangles * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header: 80 bytes (zeros is fine, or write a label)
  const headerStr = "vcad binary STL export";
  for (let i = 0; i < headerStr.length && i < 80; i++) {
    view.setUint8(i, headerStr.charCodeAt(i));
  }

  // Triangle count
  view.setUint32(80, totalTriangles, true);

  let offset = 84;

  for (const part of scene.parts) {
    const { positions, indices } = part.mesh;
    const numTris = indices.length / 3;

    for (let t = 0; t < numTris; t++) {
      const i0 = indices[t * 3]!;
      const i1 = indices[t * 3 + 1]!;
      const i2 = indices[t * 3 + 2]!;

      // Vertices
      const ax = positions[i0 * 3]!;
      const ay = positions[i0 * 3 + 1]!;
      const az = positions[i0 * 3 + 2]!;
      const bx = positions[i1 * 3]!;
      const by = positions[i1 * 3 + 1]!;
      const bz = positions[i1 * 3 + 2]!;
      const cx = positions[i2 * 3]!;
      const cy = positions[i2 * 3 + 1]!;
      const cz = positions[i2 * 3 + 2]!;

      // Compute face normal
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) { nx /= len; ny /= len; nz /= len; }

      // Normal
      view.setFloat32(offset, nx, true); offset += 4;
      view.setFloat32(offset, ny, true); offset += 4;
      view.setFloat32(offset, nz, true); offset += 4;

      // Vertex 1
      view.setFloat32(offset, ax, true); offset += 4;
      view.setFloat32(offset, ay, true); offset += 4;
      view.setFloat32(offset, az, true); offset += 4;

      // Vertex 2
      view.setFloat32(offset, bx, true); offset += 4;
      view.setFloat32(offset, by, true); offset += 4;
      view.setFloat32(offset, bz, true); offset += 4;

      // Vertex 3
      view.setFloat32(offset, cx, true); offset += 4;
      view.setFloat32(offset, cy, true); offset += 4;
      view.setFloat32(offset, cz, true); offset += 4;

      // Attribute byte count
      view.setUint16(offset, 0, true); offset += 2;
    }
  }

  return new Blob([buffer], { type: "application/octet-stream" });
}
