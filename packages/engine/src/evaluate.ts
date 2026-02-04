import type {
  Document,
  Node,
  NodeId,
  CsgOp,
  Sketch2DOp,
  SketchSegment2D,
  SweepOp,
  LoftOp,
  Transform3D,
  ImportedMeshOp,
} from "@vcad/ir";
import type {
  EvaluatedScene,
  EvaluatedPartDef,
  EvaluatedInstance,
  TriangleMesh,
} from "./mesh.js";
import type { Solid } from "@vcad/kernel-wasm";
import { solveForwardKinematics } from "./kinematics.js";

/** Debug flag - set to true to enable verbose console logging */
const DEBUG_EVAL = false;

/** Convert IR sketch segment to WASM format */
function convertSegment(seg: SketchSegment2D) {
  if (seg.type === "Line") {
    return {
      type: "Line" as const,
      start: [seg.start.x, seg.start.y],
      end: [seg.end.x, seg.end.y],
    };
  } else {
    return {
      type: "Arc" as const,
      start: [seg.start.x, seg.start.y],
      end: [seg.end.x, seg.end.y],
      center: [seg.center.x, seg.center.y],
      ccw: seg.ccw,
    };
  }
}

/** Convert IR Sketch2D op to WASM profile format */
function convertSketchToProfile(op: Sketch2DOp) {
  return {
    origin: [op.origin.x, op.origin.y, op.origin.z],
    x_dir: [op.x_dir.x, op.x_dir.y, op.x_dir.z],
    y_dir: [op.y_dir.x, op.y_dir.y, op.y_dir.z],
    segments: op.segments.map(convertSegment),
  };
}

/** Type for the kernel module */
interface KernelModule {
  Solid: typeof Solid;
}

/** Extract a TriangleMesh from a Solid. */
function solidToMesh(solid: Solid): TriangleMesh {
  const meshData = solid.getMesh();
  const positions = new Float32Array(meshData.positions);
  const indices = new Uint32Array(meshData.indices);

  // Validate indices - check for out-of-bounds references
  const numVertices = positions.length / 3;
  let hasInvalidIndices = false;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] >= numVertices) {
      hasInvalidIndices = true;
      if (DEBUG_EVAL) console.warn(`[MESH] Invalid index ${indices[i]} at position ${i}, max vertex is ${numVertices - 1}`);
      break;
    }
  }

  if (hasInvalidIndices) {
    // Filter out invalid triangles
    const validIndices: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];
      if (i0 < numVertices && i1 < numVertices && i2 < numVertices) {
        validIndices.push(i0, i1, i2);
      }
    }
    if (DEBUG_EVAL) console.warn(`[MESH] Filtered ${(indices.length - validIndices.length) / 3} invalid triangles, ${validIndices.length / 3} remaining`);
    return {
      positions,
      indices: new Uint32Array(validIndices),
      normals: meshData.normals ? new Float32Array(meshData.normals) : undefined,
    };
  }

  return {
    positions,
    indices,
    normals: meshData.normals ? new Float32Array(meshData.normals) : undefined,
  };
}

/** Transform info extracted from node chain */
interface TransformInfo {
  translate: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

/**
 * Find an ImportedMesh in the node chain and extract transforms.
 * Returns null if the chain doesn't contain an ImportedMesh.
 */
function findImportedMesh(
  rootId: NodeId,
  nodes: Record<string, Node>,
): { mesh: ImportedMeshOp; transform: TransformInfo } | null {
  const transform: TransformInfo = {
    translate: { x: 0, y: 0, z: 0 },
    rotate: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };

  let current = rootId;
  while (true) {
    const node = nodes[String(current)];
    if (!node) return null;

    if (node.op.type === "ImportedMesh") {
      return { mesh: node.op, transform };
    }

    // Extract transforms and follow child
    if (node.op.type === "Translate") {
      transform.translate = node.op.offset;
      current = node.op.child;
    } else if (node.op.type === "Rotate") {
      transform.rotate = node.op.angles;
      current = node.op.child;
    } else if (node.op.type === "Scale") {
      transform.scale = node.op.factor;
      current = node.op.child;
    } else {
      return null;
    }
  }
}

/**
 * Apply a transform to mesh positions.
 * Order: scale → rotate → translate (matching typical CAD order)
 */
function transformMesh(
  mesh: TriangleMesh,
  transform: TransformInfo,
): TriangleMesh {
  const { translate, rotate, scale } = transform;
  const positions = new Float32Array(mesh.positions.length);

  // Convert rotation from degrees to radians
  const rx = (rotate.x * Math.PI) / 180;
  const ry = (rotate.y * Math.PI) / 180;
  const rz = (rotate.z * Math.PI) / 180;

  // Precompute trig values
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // Rotation matrix (Z * Y * X order)
  const m00 = cy * cz;
  const m01 = sx * sy * cz - cx * sz;
  const m02 = cx * sy * cz + sx * sz;
  const m10 = cy * sz;
  const m11 = sx * sy * sz + cx * cz;
  const m12 = cx * sy * sz - sx * cz;
  const m20 = -sy;
  const m21 = sx * cy;
  const m22 = cx * cy;

  for (let i = 0; i < mesh.positions.length; i += 3) {
    // Scale
    let x = mesh.positions[i] * scale.x;
    let y = mesh.positions[i + 1] * scale.y;
    let z = mesh.positions[i + 2] * scale.z;

    // Rotate
    const rx = m00 * x + m01 * y + m02 * z;
    const ry = m10 * x + m11 * y + m12 * z;
    const rz = m20 * x + m21 * y + m22 * z;

    // Translate
    positions[i] = rx + translate.x;
    positions[i + 1] = ry + translate.y;
    positions[i + 2] = rz + translate.z;
  }

  // Transform normals if present (rotation only, no translation)
  let normals = mesh.normals;
  if (mesh.normals) {
    normals = new Float32Array(mesh.normals.length);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nx = mesh.normals[i];
      const ny = mesh.normals[i + 1];
      const nz = mesh.normals[i + 2];

      normals[i] = m00 * nx + m01 * ny + m02 * nz;
      normals[i + 1] = m10 * nx + m11 * ny + m12 * nz;
      normals[i + 2] = m20 * nx + m21 * ny + m22 * nz;
    }
  }

  return { positions, indices: mesh.indices, normals };
}

/** Options for document evaluation */
export interface EvaluateOptions {
  /** Skip O(n²) clash detection for faster updates during parametric editing */
  skipClashDetection?: boolean;
}

/**
 * Evaluate a vcad IR Document into an EvaluatedScene using vcad-kernel-wasm.
 *
 * Supports two modes:
 * - Traditional mode: evaluates `doc.roots` as independent parts
 * - Assembly mode: evaluates `doc.partDefs`, applies kinematics to `doc.instances`
 *
 * If both are present, assembly mode takes precedence but traditional parts
 * are also included.
 */
export function evaluateDocument(
  doc: Document,
  kernel: KernelModule,
  options: EvaluateOptions = {},
): EvaluatedScene {
  const { Solid } = kernel;
  const cache = new Map<NodeId, Solid>();

  if (DEBUG_EVAL) {
    console.group("[ENGINE] evaluateDocument");
    console.log("Number of roots:", doc.roots.length);
    console.log("Roots:", JSON.stringify(doc.roots, null, 2));
  }

  // Traditional mode: evaluate roots (filter out hidden parts)
  const visibleRoots = doc.roots.filter((entry) => entry.visible !== false);
  const solids: Solid[] = [];
  const parts = visibleRoots.map((entry, idx) => {
    const node = doc.nodes[String(entry.root)];
    if (DEBUG_EVAL) {
      console.group(`[ENGINE] Evaluating root[${idx}] nodeId=${entry.root}`);
      console.log("Node:", JSON.stringify(node, null, 2));
    }

    // Check if this is an imported mesh (doesn't go through Solid pipeline)
    const imported = findImportedMesh(entry.root, doc.nodes);
    if (imported) {
      if (DEBUG_EVAL) console.log("Found ImportedMesh with", imported.mesh.positions.length / 3, "vertices");
      const baseMesh: TriangleMesh = {
        positions: new Float32Array(imported.mesh.positions),
        indices: new Uint32Array(imported.mesh.indices),
        normals: imported.mesh.normals ? new Float32Array(imported.mesh.normals) : undefined,
      };
      const mesh = transformMesh(baseMesh, imported.transform);
      if (DEBUG_EVAL) {
        console.log("Result mesh - triangles:", mesh.indices.length / 3, "vertices:", mesh.positions.length / 3);
        console.groupEnd();
      }
      // Push empty solid for clash detection (imported meshes don't participate)
      solids.push(Solid.empty());
      return { mesh, material: entry.material };
    }

    // Normal solid-based evaluation
    const solid = evaluateNode(entry.root, doc.nodes, Solid, cache, 0);
    const mesh = solidToMesh(solid);
    if (DEBUG_EVAL) {
      console.log("Result mesh - triangles:", mesh.indices.length / 3, "vertices:", mesh.positions.length / 3);
      console.groupEnd();
    }
    solids.push(solid);
    return {
      mesh,
      material: entry.material,
      // Include solid for ray tracing (if it has BRep data)
      solid: solid,
    };
  });

  if (DEBUG_EVAL) {
    console.log("Total parts evaluated:", parts.length);
    console.groupEnd();
  }

  // Assembly mode: evaluate partDefs and instances
  let evaluatedPartDefs: EvaluatedPartDef[] | undefined;
  let evaluatedInstances: EvaluatedInstance[] | undefined;

  if (doc.partDefs && Object.keys(doc.partDefs).length > 0 && doc.instances && doc.instances.length > 0) {
    // Solve forward kinematics to get world transforms
    const worldTransforms = solveForwardKinematics(doc);

    // Evaluate each part definition once
    const partDefSolids = new Map<string, Solid>();
    const partDefMeshes = new Map<string, TriangleMesh>();

    evaluatedPartDefs = [];
    for (const [id, partDef] of Object.entries(doc.partDefs)) {
      const solid = evaluateNode(partDef.root, doc.nodes, Solid, cache, 0);
      partDefSolids.set(id, solid);
      const mesh = solidToMesh(solid);
      partDefMeshes.set(id, mesh);
      evaluatedPartDefs.push({ id, mesh });
    }

    // Create evaluated instances with world transforms
    evaluatedInstances = [];
    for (const instance of doc.instances) {
      const mesh = partDefMeshes.get(instance.partDefId);
      if (!mesh) {
        if (DEBUG_EVAL) console.warn(`Instance ${instance.id} references unknown partDef ${instance.partDefId}`);
        continue;
      }

      // Get world transform (from kinematics or instance's own transform)
      const worldTransform = worldTransforms.get(instance.id) ?? instance.transform;

      // Determine material: instance override > partDef default > "default"
      const partDef = doc.partDefs[instance.partDefId];
      const material = instance.material ?? partDef?.defaultMaterial ?? "default";

      evaluatedInstances.push({
        instanceId: instance.id,
        partDefId: instance.partDefId,
        name: instance.name,
        mesh,
        material,
        transform: worldTransform,
      });

      // Note: Clash detection for assembly instances is disabled because FK transforms
      // are applied in Three.js, not baked into the solid geometry. Proper clash detection
      // for assemblies would require computing transformed meshes, not boolean operations.
    }
  }

  // Compute pairwise intersections for clash detection
  // Skip during parametric editing for performance (O(n²) operation)
  const clashes: TriangleMesh[] = [];

  if (!options.skipClashDetection) {
    // Clashes between traditional parts (non-assembly mode)
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const intersection = solids[i].intersection(solids[j]);
        if (!intersection.isEmpty()) {
          const meshData = intersection.getMesh();
          if (meshData.positions.length > 0) {
            clashes.push({
              positions: new Float32Array(meshData.positions),
              indices: new Uint32Array(meshData.indices),
              normals: meshData.normals
                ? new Float32Array(meshData.normals)
                : undefined,
            });
          }
        }
      }
    }
  }

  // Note: Assembly clash detection is disabled. FK transforms are applied in the
  // renderer, not baked into geometry, so boolean intersection won't work correctly.
  // TODO: Implement proper assembly clash detection using transformed mesh positions.

  return {
    parts,
    partDefs: evaluatedPartDefs,
    instances: evaluatedInstances,
    clashes,
  };
}

function evaluateNode(
  nodeId: NodeId,
  nodes: Record<string, Node>,
  Solid: typeof import("@vcad/kernel-wasm").Solid,
  cache: Map<NodeId, import("@vcad/kernel-wasm").Solid>,
  depth = 0,
): import("@vcad/kernel-wasm").Solid {
  const cached = cache.get(nodeId);
  if (cached) {
    if (DEBUG_EVAL) {
      const indent = "  ".repeat(depth);
      console.log(`${indent}[NODE] ${nodeId} (CACHED)`);
    }
    return cached;
  }

  const node = nodes[String(nodeId)];
  if (!node) {
    throw new Error(`Missing node: ${nodeId}`);
  }

  if (DEBUG_EVAL) {
    const indent = "  ".repeat(depth);
    console.log(`${indent}[NODE] ${nodeId} type=${node.op.type} name=${node.name || "(unnamed)"}`);
  }
  const result = evaluateOp(node.op, nodes, Solid, cache, depth);
  cache.set(nodeId, result);
  return result;
}

function evaluateOp(
  op: CsgOp,
  nodes: Record<string, Node>,
  Solid: typeof import("@vcad/kernel-wasm").Solid,
  cache: Map<NodeId, import("@vcad/kernel-wasm").Solid>,
  depth = 0,
): import("@vcad/kernel-wasm").Solid {
  switch (op.type) {
    case "Cube":
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Cube(${op.size.x}, ${op.size.y}, ${op.size.z})`);
      }
      return Solid.cube(op.size.x, op.size.y, op.size.z);

    case "Cylinder":
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Cylinder(r=${op.radius}, h=${op.height})`);
      }
      return Solid.cylinder(op.radius, op.height, op.segments || undefined);

    case "Sphere":
      return Solid.sphere(op.radius, op.segments || undefined);

    case "Cone":
      return Solid.cone(
        op.radius_bottom,
        op.radius_top,
        op.height,
        op.segments || undefined,
      );

    case "Empty":
      return Solid.empty();

    case "Union": {
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Union(left=${op.left}, right=${op.right})`);
      }
      const left = evaluateNode(op.left, nodes, Solid, cache, depth + 1);
      const right = evaluateNode(op.right, nodes, Solid, cache, depth + 1);
      return left.union(right);
    }

    case "Difference": {
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Difference(left=${op.left}, right=${op.right})`);
      }
      const left = evaluateNode(op.left, nodes, Solid, cache, depth + 1);
      const right = evaluateNode(op.right, nodes, Solid, cache, depth + 1);
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        const leftTris = left.getMesh().indices.length / 3;
        const rightTris = right.getMesh().indices.length / 3;
        console.log(`${indent}  -> Difference: left has ${leftTris} tris, right has ${rightTris} tris`);
      }
      const result = left.difference(right);
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Difference result: ${result.getMesh().indices.length / 3} tris`);
      }
      return result;
    }

    case "Intersection": {
      const left = evaluateNode(op.left, nodes, Solid, cache, depth + 1);
      const right = evaluateNode(op.right, nodes, Solid, cache, depth + 1);
      return left.intersection(right);
    }

    case "Translate": {
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Translate(${op.offset.x}, ${op.offset.y}, ${op.offset.z}) child=${op.child}`);
      }
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.translate(op.offset.x, op.offset.y, op.offset.z);
    }

    case "Rotate": {
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Rotate(${op.angles.x}, ${op.angles.y}, ${op.angles.z}) child=${op.child}`);
      }
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.rotate(op.angles.x, op.angles.y, op.angles.z);
    }

    case "Scale": {
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Scale(${op.factor.x}, ${op.factor.y}, ${op.factor.z}) child=${op.child}`);
      }
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.scale(op.factor.x, op.factor.y, op.factor.z);
    }

    case "Sketch2D":
      // Sketch2D nodes don't produce geometry directly — they're referenced by Extrude/Revolve
      // Return an empty solid as a placeholder
      return Solid.empty();

    case "Extrude": {
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Extrude(sketch=${op.sketch}, dir=(${op.direction.x}, ${op.direction.y}, ${op.direction.z}), twist=${op.twist_angle ?? 0}, scale=${op.scale_end ?? 1})`);
      }
      const sketchNode = nodes[String(op.sketch)];
      if (!sketchNode || sketchNode.op.type !== "Sketch2D") {
        throw new Error(`Extrude references invalid sketch node: ${op.sketch}`);
      }
      const profile = convertSketchToProfile(sketchNode.op);
      const direction = new Float64Array([
        op.direction.x,
        op.direction.y,
        op.direction.z,
      ]);
      // Use extrudeWithOptions if twist or scale is specified
      const hasTwist = op.twist_angle !== undefined && Math.abs(op.twist_angle) > 1e-12;
      const hasScale = op.scale_end !== undefined && Math.abs(op.scale_end - 1.0) > 1e-12;
      const result = (hasTwist || hasScale)
        ? Solid.extrudeWithOptions(
            profile,
            direction,
            op.twist_angle ?? 0,
            op.scale_end ?? 1.0
          )
        : Solid.extrude(profile, direction);
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> Extrude result: ${result.getMesh().indices.length / 3} tris`);
      }
      return result;
    }

    case "Revolve": {
      const sketchNode = nodes[String(op.sketch)];
      if (!sketchNode || sketchNode.op.type !== "Sketch2D") {
        throw new Error(`Revolve references invalid sketch node: ${op.sketch}`);
      }
      const profile = convertSketchToProfile(sketchNode.op);
      const axisOrigin = new Float64Array([
        op.axis_origin.x,
        op.axis_origin.y,
        op.axis_origin.z,
      ]);
      const axisDir = new Float64Array([
        op.axis_dir.x,
        op.axis_dir.y,
        op.axis_dir.z,
      ]);
      return Solid.revolve(profile, axisOrigin, axisDir, op.angle_deg);
    }

    case "LinearPattern": {
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.linearPattern(
        op.direction.x,
        op.direction.y,
        op.direction.z,
        op.count,
        op.spacing,
      );
    }

    case "CircularPattern": {
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.circularPattern(
        op.axis_origin.x,
        op.axis_origin.y,
        op.axis_origin.z,
        op.axis_dir.x,
        op.axis_dir.y,
        op.axis_dir.z,
        op.count,
        op.angle_deg,
      );
    }

    case "Shell": {
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.shell(op.thickness);
    }

    case "Fillet": {
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.fillet(op.radius);
    }

    case "Chamfer": {
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.chamfer(op.distance);
    }

    case "Sweep": {
      const sketchNode = nodes[String(op.sketch)];
      if (!sketchNode || sketchNode.op.type !== "Sketch2D") {
        throw new Error(`Sweep references invalid sketch node: ${op.sketch}`);
      }
      const profile = convertSketchToProfile(sketchNode.op);

      if (op.path.type === "Line") {
        const start = new Float64Array([
          op.path.start.x,
          op.path.start.y,
          op.path.start.z,
        ]);
        const end = new Float64Array([
          op.path.end.x,
          op.path.end.y,
          op.path.end.z,
        ]);
        return Solid.sweepLine(
          profile,
          start,
          end,
          op.twist_angle,
          op.scale_start,
          op.scale_end,
          op.orientation,
        );
      } else {
        // Helix path
        return Solid.sweepHelix(
          profile,
          op.path.radius,
          op.path.pitch,
          op.path.height,
          op.path.turns,
          op.twist_angle,
          op.scale_start,
          op.scale_end,
          op.path_segments,
          op.arc_segments,
          op.orientation,
        );
      }
    }

    case "Loft": {
      const profiles = op.sketches.map((sketchId) => {
        const sketchNode = nodes[String(sketchId)];
        if (!sketchNode || sketchNode.op.type !== "Sketch2D") {
          throw new Error(`Loft references invalid sketch node: ${sketchId}`);
        }
        return convertSketchToProfile(sketchNode.op);
      });
      return Solid.loft(profiles, op.closed);
    }

    case "ImportedMesh":
      // ImportedMesh is handled specially in evaluateDocument, not through Solid
      // Return empty solid as fallback
      if (DEBUG_EVAL) {
        const indent = "  ".repeat(depth);
        console.log(`${indent}  -> ImportedMesh (handled at document level)`);
      }
      return Solid.empty();
  }
}
