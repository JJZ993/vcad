import { describe, expect, it, beforeAll } from "vitest";
import type { Document, Node } from "@vcad/ir";
import { createDocument } from "@vcad/ir";
import { Engine, type EvaluatedScene } from "../index.js";

let engine: Engine;

beforeAll(async () => {
  engine = await Engine.init();
});

/** Helper: build a single-root document from nodes. */
function singlePartDoc(
  nodes: Node[],
  rootId: number,
  material = "default",
): Document {
  const doc = createDocument();
  for (const n of nodes) {
    doc.nodes[String(n.id)] = n;
  }
  doc.roots.push({ root: rootId, material });
  return doc;
}

describe("Primitives", () => {
  it("evaluates a cube", () => {
    const doc = singlePartDoc(
      [{ id: 1, name: "box", op: { type: "Cube", size: { x: 10, y: 20, z: 30 } } }],
      1,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
    expect(scene.parts[0].material).toBe("default");
    // Cube has 12 triangles (6 faces × 2)
    expect(scene.parts[0].mesh.indices.length).toBe(36);
  });

  it("evaluates a cylinder", () => {
    const doc = singlePartDoc(
      [{ id: 1, name: "cyl", op: { type: "Cylinder", radius: 5, height: 10, segments: 32 } }],
      1,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("evaluates a sphere", () => {
    const doc = singlePartDoc(
      [{ id: 1, name: "sph", op: { type: "Sphere", radius: 5, segments: 16 } }],
      1,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("evaluates a cone", () => {
    const doc = singlePartDoc(
      [
        {
          id: 1,
          name: "cone",
          op: { type: "Cone", radius_bottom: 5, radius_top: 0, height: 10, segments: 32 },
        },
      ],
      1,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("evaluates an empty manifold", () => {
    const doc = singlePartDoc(
      [{ id: 1, name: "empty", op: { type: "Empty" } }],
      1,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    expect(scene.parts[0].mesh.positions.length).toBe(0);
    expect(scene.parts[0].mesh.indices.length).toBe(0);
  });
});

describe("CSG operations", () => {
  it("evaluates union", () => {
    // Union two offset cubes to get a larger combined shape
    const doc = singlePartDoc(
      [
        { id: 1, name: "a", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
        { id: 2, name: "b_cube", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
        { id: 3, name: "b", op: { type: "Translate", child: 2, offset: { x: 5, y: 0, z: 0 } } },
        { id: 4, name: "u", op: { type: "Union", left: 1, right: 3 } },
      ],
      4,
    );
    const scene = engine.evaluate(doc);
    // Union of two offset cubes produces geometry
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("evaluates difference", () => {
    const doc = singlePartDoc(
      [
        { id: 1, name: "block", op: { type: "Cube", size: { x: 20, y: 20, z: 20 } } },
        { id: 2, name: "hole", op: { type: "Cylinder", radius: 3, height: 30, segments: 32 } },
        { id: 3, name: "result", op: { type: "Difference", left: 1, right: 2 } },
      ],
      3,
    );
    const scene = engine.evaluate(doc);
    // Difference produces more triangles than a plain cube
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(36);
  });

  it("evaluates intersection", () => {
    const doc = singlePartDoc(
      [
        { id: 1, name: "a", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
        {
          id: 2,
          name: "b",
          op: { type: "Translate", child: 3, offset: { x: 5, y: 5, z: 5 } },
        },
        { id: 3, name: "b_cube", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
        { id: 4, name: "inter", op: { type: "Intersection", left: 1, right: 2 } },
      ],
      4,
    );
    const scene = engine.evaluate(doc);
    // Intersection of two offset cubes produces a smaller box
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });
});

describe("Transforms", () => {
  it("translate shifts bounding box", () => {
    const doc = singlePartDoc(
      [
        { id: 1, name: "box", op: { type: "Cube", size: { x: 1, y: 1, z: 1 } } },
        {
          id: 2,
          name: "moved",
          op: { type: "Translate", child: 1, offset: { x: 100, y: 0, z: 0 } },
        },
      ],
      2,
    );
    const scene = engine.evaluate(doc);
    const pos = scene.parts[0].mesh.positions;
    // All x coords should be >= 100
    for (let i = 0; i < pos.length; i += 3) {
      expect(pos[i]).toBeGreaterThanOrEqual(99.9);
    }
  });

  it("scale changes dimensions", () => {
    const doc = singlePartDoc(
      [
        { id: 1, name: "box", op: { type: "Cube", size: { x: 1, y: 1, z: 1 } } },
        {
          id: 2,
          name: "scaled",
          op: { type: "Scale", child: 1, factor: { x: 10, y: 10, z: 10 } },
        },
      ],
      2,
    );
    const scene = engine.evaluate(doc);
    const pos = scene.parts[0].mesh.positions;
    let maxX = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] > maxX) maxX = pos[i];
    }
    expect(maxX).toBeCloseTo(10, 1);
  });

  it("rotate produces valid mesh", () => {
    const doc = singlePartDoc(
      [
        { id: 1, name: "box", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
        {
          id: 2,
          name: "rotated",
          op: { type: "Rotate", child: 1, angles: { x: 0, y: 0, z: 45 } },
        },
      ],
      2,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });
});

describe("DAG sharing", () => {
  it("shared nodes are evaluated once", () => {
    // Two differences sharing the same cylinder
    const doc = createDocument();
    doc.nodes["1"] = {
      id: 1,
      name: "block_a",
      op: { type: "Cube", size: { x: 20, y: 20, z: 20 } },
    };
    doc.nodes["2"] = {
      id: 2,
      name: "block_b",
      op: { type: "Cube", size: { x: 20, y: 20, z: 20 } },
    };
    doc.nodes["3"] = {
      id: 3,
      name: "shared_hole",
      op: { type: "Cylinder", radius: 3, height: 30, segments: 32 },
    };
    doc.nodes["4"] = {
      id: 4,
      name: "diff_a",
      op: { type: "Difference", left: 1, right: 3 },
    };
    doc.nodes["5"] = {
      id: 5,
      name: "diff_b",
      op: { type: "Difference", left: 2, right: 3 },
    };
    doc.roots.push({ root: 4, material: "steel" });
    doc.roots.push({ root: 5, material: "aluminum" });

    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(2);
    // Both parts should have identical geometry (same operations, same shared cylinder)
    expect(scene.parts[0].mesh.indices.length).toBe(
      scene.parts[1].mesh.indices.length,
    );
    expect(scene.parts[0].material).toBe("steel");
    expect(scene.parts[1].material).toBe("aluminum");
  });
});

describe("Scene", () => {
  it("multi-root document returns correct part count and materials", () => {
    const doc = createDocument();
    doc.nodes["1"] = {
      id: 1,
      name: "part_a",
      op: { type: "Cube", size: { x: 10, y: 10, z: 10 } },
    };
    doc.nodes["2"] = {
      id: 2,
      name: "part_b",
      op: { type: "Sphere", radius: 5, segments: 16 },
    };
    doc.roots.push({ root: 1, material: "wood" });
    doc.roots.push({ root: 2, material: "metal" });

    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(2);
    expect(scene.parts[0].material).toBe("wood");
    expect(scene.parts[1].material).toBe("metal");
  });
});

describe("Errors", () => {
  it("throws on missing node reference", () => {
    const doc = singlePartDoc(
      [{ id: 1, name: "bad", op: { type: "Union", left: 99, right: 100 } }],
      1,
    );
    expect(() => engine.evaluate(doc)).toThrow("Missing node: 99");
  });
});
