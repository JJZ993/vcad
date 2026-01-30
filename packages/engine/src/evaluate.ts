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
} from "@vcad/ir";
import type {
  EvaluatedScene,
  EvaluatedPartDef,
  EvaluatedInstance,
  TriangleMesh,
} from "./mesh.js";
import type { Solid } from "@vcad/kernel-wasm";
import { solveForwardKinematics } from "./kinematics.js";

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
  return {
    positions: new Float32Array(meshData.positions),
    indices: new Uint32Array(meshData.indices),
    normals: meshData.normals ? new Float32Array(meshData.normals) : undefined,
  };
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
): EvaluatedScene {
  const { Solid } = kernel;
  const cache = new Map<NodeId, Solid>();

  console.group("[ENGINE] evaluateDocument");
  console.log("Number of roots:", doc.roots.length);
  console.log("Roots:", JSON.stringify(doc.roots, null, 2));

  // Traditional mode: evaluate roots
  const solids: Solid[] = [];
  const parts = doc.roots.map((entry, idx) => {
    const node = doc.nodes[String(entry.root)];
    console.group(`[ENGINE] Evaluating root[${idx}] nodeId=${entry.root}`);
    console.log("Node:", JSON.stringify(node, null, 2));
    const solid = evaluateNode(entry.root, doc.nodes, Solid, cache, 0);
    const mesh = solidToMesh(solid);
    console.log("Result mesh - triangles:", mesh.indices.length / 3, "vertices:", mesh.positions.length / 3);
    console.groupEnd();
    solids.push(solid);
    return {
      mesh,
      material: entry.material,
    };
  });

  console.log("Total parts evaluated:", parts.length);
  console.groupEnd();

  // Assembly mode: evaluate partDefs and instances
  let evaluatedPartDefs: EvaluatedPartDef[] | undefined;
  let evaluatedInstances: EvaluatedInstance[] | undefined;
  const instanceSolids: { instanceId: string; solid: Solid; transform: Transform3D }[] = [];

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
        console.warn(`Instance ${instance.id} references unknown partDef ${instance.partDefId}`);
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

      // Store transformed solid for clash detection
      const baseSolid = partDefSolids.get(instance.partDefId);
      if (baseSolid && worldTransform) {
        // Transform the solid for clash detection
        let transformedSolid = baseSolid
          .scale(worldTransform.scale.x, worldTransform.scale.y, worldTransform.scale.z)
          .rotate(worldTransform.rotation.x, worldTransform.rotation.y, worldTransform.rotation.z)
          .translate(worldTransform.translation.x, worldTransform.translation.y, worldTransform.translation.z);
        instanceSolids.push({ instanceId: instance.id, solid: transformedSolid, transform: worldTransform });
      }
    }
  }

  // Compute pairwise intersections for clash detection
  const clashes: TriangleMesh[] = [];

  // Clashes between traditional parts
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

  // Clashes between assembly instances
  for (let i = 0; i < instanceSolids.length; i++) {
    for (let j = i + 1; j < instanceSolids.length; j++) {
      const intersection = instanceSolids[i].solid.intersection(instanceSolids[j].solid);
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
  const indent = "  ".repeat(depth);
  const cached = cache.get(nodeId);
  if (cached) {
    console.log(`${indent}[NODE] ${nodeId} (CACHED)`);
    return cached;
  }

  const node = nodes[String(nodeId)];
  if (!node) {
    throw new Error(`Missing node: ${nodeId}`);
  }

  console.log(`${indent}[NODE] ${nodeId} type=${node.op.type} name=${node.name || "(unnamed)"}`);
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
  const indent = "  ".repeat(depth);
  switch (op.type) {
    case "Cube":
      console.log(`${indent}  -> Cube(${op.size.x}, ${op.size.y}, ${op.size.z})`);
      return Solid.cube(op.size.x, op.size.y, op.size.z);

    case "Cylinder":
      console.log(`${indent}  -> Cylinder(r=${op.radius}, h=${op.height})`);
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
      console.log(`${indent}  -> Union(left=${op.left}, right=${op.right})`);
      const left = evaluateNode(op.left, nodes, Solid, cache, depth + 1);
      const right = evaluateNode(op.right, nodes, Solid, cache, depth + 1);
      return left.union(right);
    }

    case "Difference": {
      console.log(`${indent}  -> Difference(left=${op.left}, right=${op.right})`);
      const left = evaluateNode(op.left, nodes, Solid, cache, depth + 1);
      const right = evaluateNode(op.right, nodes, Solid, cache, depth + 1);
      const leftTris = left.getMesh().indices.length / 3;
      const rightTris = right.getMesh().indices.length / 3;
      console.log(`${indent}  -> Difference: left has ${leftTris} tris, right has ${rightTris} tris`);
      const result = left.difference(right);
      console.log(`${indent}  -> Difference result: ${result.getMesh().indices.length / 3} tris`);
      return result;
    }

    case "Intersection": {
      const left = evaluateNode(op.left, nodes, Solid, cache, depth + 1);
      const right = evaluateNode(op.right, nodes, Solid, cache, depth + 1);
      return left.intersection(right);
    }

    case "Translate": {
      console.log(`${indent}  -> Translate(${op.offset.x}, ${op.offset.y}, ${op.offset.z}) child=${op.child}`);
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.translate(op.offset.x, op.offset.y, op.offset.z);
    }

    case "Rotate": {
      console.log(`${indent}  -> Rotate(${op.angles.x}, ${op.angles.y}, ${op.angles.z}) child=${op.child}`);
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.rotate(op.angles.x, op.angles.y, op.angles.z);
    }

    case "Scale": {
      console.log(`${indent}  -> Scale(${op.factor.x}, ${op.factor.y}, ${op.factor.z}) child=${op.child}`);
      const child = evaluateNode(op.child, nodes, Solid, cache, depth + 1);
      return child.scale(op.factor.x, op.factor.y, op.factor.z);
    }

    case "Sketch2D":
      // Sketch2D nodes don't produce geometry directly — they're referenced by Extrude/Revolve
      // Return an empty solid as a placeholder
      return Solid.empty();

    case "Extrude": {
      console.log(`${indent}  -> Extrude(sketch=${op.sketch}, dir=(${op.direction.x}, ${op.direction.y}, ${op.direction.z}))`);
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
      const result = Solid.extrude(profile, direction);
      console.log(`${indent}  -> Extrude result: ${result.getMesh().indices.length / 3} tris`);
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
  }
}
