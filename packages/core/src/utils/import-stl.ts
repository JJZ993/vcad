import type { TriangleMesh } from "@vcad/engine";

/**
 * Parse an STL file (binary or ASCII) into a TriangleMesh.
 * Deduplicates vertices using a position hash map since STL stores vertices per-face.
 */
export function parseStl(buffer: ArrayBuffer): TriangleMesh {
  // ASCII STL starts with "solid" and contains "facet"
  // Binary STL has 80-byte header that might also start with "solid"
  // so we check for "facet" to distinguish
  if (isAsciiStl(buffer)) {
    return parseAsciiStl(buffer);
  } else {
    return parseBinaryStl(buffer);
  }
}

/**
 * Check if buffer is ASCII STL format.
 * ASCII files start with "solid" and contain "facet normal".
 */
function isAsciiStl(buffer: ArrayBuffer): boolean {
  const header = new Uint8Array(buffer, 0, Math.min(80, buffer.byteLength));
  const headerStr = String.fromCharCode(...header);

  // Must start with "solid"
  if (!headerStr.trimStart().toLowerCase().startsWith("solid")) {
    return false;
  }

  // Check for "facet" keyword in the first ~1KB to confirm ASCII
  const checkLength = Math.min(1024, buffer.byteLength);
  const sample = new Uint8Array(buffer, 0, checkLength);
  const sampleStr = String.fromCharCode(...sample).toLowerCase();
  return sampleStr.includes("facet");
}

/**
 * Parse binary STL format:
 * - 80 byte header
 * - uint32 triangle count
 * - Per triangle (50 bytes):
 *   - 12 bytes normal (float32 x3)
 *   - 36 bytes vertices (float32 x3 x3)
 *   - 2 bytes attribute
 */
function parseBinaryStl(buffer: ArrayBuffer): TriangleMesh {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);

  // Validate buffer size
  const expectedSize = 84 + triangleCount * 50;
  if (buffer.byteLength < expectedSize) {
    throw new Error(
      `Invalid STL: expected ${expectedSize} bytes, got ${buffer.byteLength}`
    );
  }

  // Deduplicate vertices using position hash map
  const vertexMap = new Map<string, number>();
  const positions: number[] = [];
  const indices: number[] = [];

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    offset += 12; // skip normal (we'll compute from geometry)

    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const z = view.getFloat32(offset + 8, true);
      offset += 12;

      const key = `${x},${y},${z}`;
      let idx = vertexMap.get(key);
      if (idx === undefined) {
        idx = positions.length / 3;
        vertexMap.set(key, idx);
        positions.push(x, y, z);
      }
      indices.push(idx);
    }
    offset += 2; // skip attribute byte count
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/**
 * Parse ASCII STL format:
 * solid name
 *   facet normal ni nj nk
 *     outer loop
 *       vertex v1x v1y v1z
 *       vertex v2x v2y v2z
 *       vertex v3x v3y v3z
 *     endloop
 *   endfacet
 * endsolid name
 */
function parseAsciiStl(buffer: ArrayBuffer): TriangleMesh {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split("\n");

  const vertexMap = new Map<string, number>();
  const positions: number[] = [];
  const indices: number[] = [];

  const vertexRegex = /^\s*vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/i;

  for (const line of lines) {
    const match = line.match(vertexRegex);
    if (match) {
      const x = parseFloat(match[1]!);
      const y = parseFloat(match[2]!);
      const z = parseFloat(match[3]!);

      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        throw new Error(`Invalid vertex coordinates: ${line}`);
      }

      const key = `${x},${y},${z}`;
      let idx = vertexMap.get(key);
      if (idx === undefined) {
        idx = positions.length / 3;
        vertexMap.set(key, idx);
        positions.push(x, y, z);
      }
      indices.push(idx);
    }
  }

  if (indices.length === 0) {
    throw new Error("No vertices found in ASCII STL");
  }

  if (indices.length % 3 !== 0) {
    throw new Error(
      `Invalid STL: vertex count ${indices.length} is not divisible by 3`
    );
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
