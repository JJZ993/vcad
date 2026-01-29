/**
 * inspect_cad tool — query geometry properties.
 */

import type { Document } from "@vcad/ir";
import type { Engine, TriangleMesh } from "@vcad/engine";

interface InspectInput {
  ir: Document;
}

export const inspectCadSchema = {
  type: "object" as const,
  properties: {
    ir: {
      type: "object" as const,
      description: "IR document from create_cad_document",
    },
  },
  required: ["ir"],
};

interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

interface InspectResult {
  volume_mm3: number;
  surface_area_mm2: number;
  bounding_box: BoundingBox;
  center_of_mass: { x: number; y: number; z: number };
  triangles: number;
  parts: number;
}

/** Calculate signed volume of a triangle with origin. */
function signedVolumeOfTriangle(
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
): number {
  return (
    (p1[0] * (p2[1] * p3[2] - p3[1] * p2[2]) -
      p2[0] * (p1[1] * p3[2] - p3[1] * p1[2]) +
      p3[0] * (p1[1] * p2[2] - p2[1] * p1[2])) /
    6.0
  );
}

/** Calculate area of a triangle. */
function triangleArea(
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
): number {
  // Cross product of edges
  const ax = p2[0] - p1[0];
  const ay = p2[1] - p1[1];
  const az = p2[2] - p1[2];
  const bx = p3[0] - p1[0];
  const by = p3[1] - p1[1];
  const bz = p3[2] - p1[2];

  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;

  return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2.0;
}

/** Get vertex position from mesh. */
function getVertex(
  mesh: TriangleMesh,
  index: number,
): [number, number, number] {
  const i = index * 3;
  return [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
}

/** Compute properties for a single mesh. */
function computeMeshProperties(mesh: TriangleMesh): {
  volume: number;
  area: number;
  bbox: BoundingBox;
  centroid: { x: number; y: number; z: number };
  triangles: number;
} {
  const numTriangles = mesh.indices.length / 3;

  let volume = 0;
  let area = 0;
  let cx = 0,
    cy = 0,
    cz = 0;

  const bbox: BoundingBox = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };

  for (let t = 0; t < numTriangles; t++) {
    const i0 = mesh.indices[t * 3];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];

    const p1 = getVertex(mesh, i0);
    const p2 = getVertex(mesh, i1);
    const p3 = getVertex(mesh, i2);

    // Volume via divergence theorem
    const v = signedVolumeOfTriangle(p1, p2, p3);
    volume += v;

    // Surface area
    area += triangleArea(p1, p2, p3);

    // Centroid contribution (weighted by signed volume)
    cx += v * (p1[0] + p2[0] + p3[0]) / 4;
    cy += v * (p1[1] + p2[1] + p3[1]) / 4;
    cz += v * (p1[2] + p2[2] + p3[2]) / 4;

    // Bounding box
    for (const p of [p1, p2, p3]) {
      bbox.min.x = Math.min(bbox.min.x, p[0]);
      bbox.min.y = Math.min(bbox.min.y, p[1]);
      bbox.min.z = Math.min(bbox.min.z, p[2]);
      bbox.max.x = Math.max(bbox.max.x, p[0]);
      bbox.max.y = Math.max(bbox.max.y, p[1]);
      bbox.max.z = Math.max(bbox.max.z, p[2]);
    }
  }

  // Normalize centroid by volume
  const absVolume = Math.abs(volume);
  if (absVolume > 1e-10) {
    cx /= volume;
    cy /= volume;
    cz /= volume;
  }

  return {
    volume: absVolume,
    area,
    bbox,
    centroid: { x: cx, y: cy, z: cz },
    triangles: numTriangles,
  };
}

export function inspectCad(
  input: unknown,
  engine: Engine,
): { content: Array<{ type: "text"; text: string }> } {
  const { ir } = input as InspectInput;

  // Evaluate the document
  const scene = engine.evaluate(ir);

  if (scene.parts.length === 0) {
    throw new Error("Document has no parts to inspect");
  }

  // Aggregate properties across all parts
  let totalVolume = 0;
  let totalArea = 0;
  let totalTriangles = 0;
  let weightedCx = 0,
    weightedCy = 0,
    weightedCz = 0;

  const bbox: BoundingBox = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };

  for (const part of scene.parts) {
    const props = computeMeshProperties(part.mesh);

    totalVolume += props.volume;
    totalArea += props.area;
    totalTriangles += props.triangles;

    // Weight centroid by volume
    weightedCx += props.centroid.x * props.volume;
    weightedCy += props.centroid.y * props.volume;
    weightedCz += props.centroid.z * props.volume;

    // Expand bounding box
    bbox.min.x = Math.min(bbox.min.x, props.bbox.min.x);
    bbox.min.y = Math.min(bbox.min.y, props.bbox.min.y);
    bbox.min.z = Math.min(bbox.min.z, props.bbox.min.z);
    bbox.max.x = Math.max(bbox.max.x, props.bbox.max.x);
    bbox.max.y = Math.max(bbox.max.y, props.bbox.max.y);
    bbox.max.z = Math.max(bbox.max.z, props.bbox.max.z);
  }

  // Compute overall center of mass
  const com =
    totalVolume > 1e-10
      ? {
          x: weightedCx / totalVolume,
          y: weightedCy / totalVolume,
          z: weightedCz / totalVolume,
        }
      : { x: 0, y: 0, z: 0 };

  const result: InspectResult = {
    volume_mm3: Math.round(totalVolume * 1000) / 1000,
    surface_area_mm2: Math.round(totalArea * 1000) / 1000,
    bounding_box: {
      min: {
        x: Math.round(bbox.min.x * 1000) / 1000,
        y: Math.round(bbox.min.y * 1000) / 1000,
        z: Math.round(bbox.min.z * 1000) / 1000,
      },
      max: {
        x: Math.round(bbox.max.x * 1000) / 1000,
        y: Math.round(bbox.max.y * 1000) / 1000,
        z: Math.round(bbox.max.z * 1000) / 1000,
      },
    },
    center_of_mass: {
      x: Math.round(com.x * 1000) / 1000,
      y: Math.round(com.y * 1000) / 1000,
      z: Math.round(com.z * 1000) / 1000,
    },
    triangles: totalTriangles,
    parts: scene.parts.length,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
