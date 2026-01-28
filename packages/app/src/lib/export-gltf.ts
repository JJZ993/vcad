import type { EvaluatedScene } from "@vcad/engine";

/**
 * Export an evaluated scene as a minimal GLB (binary glTF 2.0) blob.
 *
 * Merges all parts into a single mesh with merged position/index buffers.
 * GLB structure:
 *   12 bytes header (magic + version + length)
 *   JSON chunk (scene description)
 *   BIN chunk (vertex + index data)
 */
export function exportGltf(scene: EvaluatedScene): Blob {
  // Merge all part meshes into a single position + index buffer
  let totalPositions = 0;
  let totalIndices = 0;
  for (const part of scene.parts) {
    totalPositions += part.mesh.positions.length;
    totalIndices += part.mesh.indices.length;
  }

  const mergedPositions = new Float32Array(totalPositions);
  const mergedIndices = new Uint32Array(totalIndices);

  let posOffset = 0;
  let idxOffset = 0;
  let vertexOffset = 0;

  // Compute bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const part of scene.parts) {
    const { positions, indices } = part.mesh;

    mergedPositions.set(positions, posOffset);

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    for (let i = 0; i < indices.length; i++) {
      mergedIndices[idxOffset + i] = indices[i]! + vertexOffset;
    }

    posOffset += positions.length;
    idxOffset += indices.length;
    vertexOffset += positions.length / 3;
  }

  // If no geometry, produce empty box
  if (totalPositions === 0) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  // Binary buffer: positions (float32) + indices (uint32)
  const posBytes = mergedPositions.byteLength;
  const idxBytes = mergedIndices.byteLength;
  // Pad positions to 4-byte boundary (already guaranteed for float32)
  const binBufferLength = posBytes + idxBytes;

  const binBuffer = new ArrayBuffer(binBufferLength);
  new Float32Array(binBuffer, 0, mergedPositions.length).set(mergedPositions);
  new Uint32Array(binBuffer, posBytes, mergedIndices.length).set(mergedIndices);

  const vertexCount = totalPositions / 3;
  const indexCount = totalIndices;

  // Build JSON
  const gltf = {
    asset: { version: "2.0", generator: "vcad" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: vertexCount,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 1,
        componentType: 5125, // UNSIGNED_INT
        count: indexCount,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: posBytes,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: posBytes,
        byteLength: idxBytes,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [{ byteLength: binBufferLength }],
  };

  // Encode JSON to UTF-8
  const jsonStr = JSON.stringify(gltf);
  const jsonEncoder = new TextEncoder();
  const jsonBytes = jsonEncoder.encode(jsonStr);

  // Pad JSON to 4-byte alignment with spaces (0x20)
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkLength = jsonBytes.length + jsonPadding;

  // Pad BIN to 4-byte alignment with zeros
  const binPadding = (4 - (binBufferLength % 4)) % 4;
  const binChunkLength = binBufferLength + binPadding;

  // GLB total length: header (12) + JSON chunk header (8) + JSON data + BIN chunk header (8) + BIN data
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;

  const glb = new ArrayBuffer(totalLength);
  const glbView = new DataView(glb);

  // GLB header
  glbView.setUint32(0, 0x46546C67, true); // "glTF" magic
  glbView.setUint32(4, 2, true); // version
  glbView.setUint32(8, totalLength, true); // total length

  // JSON chunk
  let off = 12;
  glbView.setUint32(off, jsonChunkLength, true); off += 4;
  glbView.setUint32(off, 0x4E4F534A, true); off += 4; // "JSON"
  new Uint8Array(glb, off, jsonBytes.length).set(jsonBytes);
  // Pad with spaces
  for (let i = 0; i < jsonPadding; i++) {
    glbView.setUint8(off + jsonBytes.length + i, 0x20);
  }
  off += jsonChunkLength;

  // BIN chunk
  glbView.setUint32(off, binChunkLength, true); off += 4;
  glbView.setUint32(off, 0x004E4942, true); off += 4; // "BIN\0"
  new Uint8Array(glb, off, binBufferLength).set(new Uint8Array(binBuffer));
  // Pad with zeros (already zeroed in ArrayBuffer)

  return new Blob([glb], { type: "model/gltf-binary" });
}
