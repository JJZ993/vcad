import type { Document, Node, NodeId, CsgOp } from "@vcad/ir";
import type { EvaluatedScene, TriangleMesh } from "./mesh.js";
import type { Solid } from "@vcad/kernel-wasm";

/** Type for the kernel module */
interface KernelModule {
  Solid: typeof Solid;
}

/**
 * Evaluate a vcad IR Document into an EvaluatedScene using vcad-kernel-wasm.
 *
 * Walks the DAG for each scene root, memoizes intermediate Solid objects
 * by NodeId, then extracts triangle meshes.
 */
export function evaluateDocument(
  doc: Document,
  kernel: KernelModule,
): EvaluatedScene {
  const { Solid } = kernel;
  const cache = new Map<NodeId, Solid>();

  // Evaluate all parts
  const solids: Solid[] = [];
  const parts = doc.roots.map((entry) => {
    const solid = evaluateNode(entry.root, doc.nodes, Solid, cache);
    solids.push(solid);
    const meshData = solid.getMesh();
    const mesh: TriangleMesh = {
      positions: new Float32Array(meshData.positions),
      indices: new Uint32Array(meshData.indices),
    };
    return {
      mesh,
      material: entry.material,
    };
  });

  // Compute pairwise intersections for clash detection
  const clashes: TriangleMesh[] = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const intersection = solids[i].intersection(solids[j]);
      // Only include non-empty intersections
      if (!intersection.isEmpty()) {
        const meshData = intersection.getMesh();
        if (meshData.positions.length > 0) {
          clashes.push({
            positions: new Float32Array(meshData.positions),
            indices: new Uint32Array(meshData.indices),
          });
        }
      }
    }
  }

  return { parts, clashes };
}

function evaluateNode(
  nodeId: NodeId,
  nodes: Record<string, Node>,
  Solid: typeof import("@vcad/kernel-wasm").Solid,
  cache: Map<NodeId, import("@vcad/kernel-wasm").Solid>,
): import("@vcad/kernel-wasm").Solid {
  const cached = cache.get(nodeId);
  if (cached) return cached;

  const node = nodes[String(nodeId)];
  if (!node) {
    throw new Error(`Missing node: ${nodeId}`);
  }

  const result = evaluateOp(node.op, nodes, Solid, cache);
  cache.set(nodeId, result);
  return result;
}

function evaluateOp(
  op: CsgOp,
  nodes: Record<string, Node>,
  Solid: typeof import("@vcad/kernel-wasm").Solid,
  cache: Map<NodeId, import("@vcad/kernel-wasm").Solid>,
): import("@vcad/kernel-wasm").Solid {
  switch (op.type) {
    case "Cube":
      return Solid.cube(op.size.x, op.size.y, op.size.z);

    case "Cylinder":
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
      const left = evaluateNode(op.left, nodes, Solid, cache);
      const right = evaluateNode(op.right, nodes, Solid, cache);
      return left.union(right);
    }

    case "Difference": {
      const left = evaluateNode(op.left, nodes, Solid, cache);
      const right = evaluateNode(op.right, nodes, Solid, cache);
      return left.difference(right);
    }

    case "Intersection": {
      const left = evaluateNode(op.left, nodes, Solid, cache);
      const right = evaluateNode(op.right, nodes, Solid, cache);
      return left.intersection(right);
    }

    case "Translate": {
      const child = evaluateNode(op.child, nodes, Solid, cache);
      return child.translate(op.offset.x, op.offset.y, op.offset.z);
    }

    case "Rotate": {
      const child = evaluateNode(op.child, nodes, Solid, cache);
      return child.rotate(op.angles.x, op.angles.y, op.angles.z);
    }

    case "Scale": {
      const child = evaluateNode(op.child, nodes, Solid, cache);
      return child.scale(op.factor.x, op.factor.y, op.factor.z);
    }
  }
}
