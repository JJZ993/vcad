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

describe("Sketch operations", () => {
  it("evaluates extrude from rectangle sketch", () => {
    const doc = singlePartDoc(
      [
        {
          id: 1,
          name: "rectangle",
          op: {
            type: "Sketch2D",
            origin: { x: 0, y: 0, z: 0 },
            x_dir: { x: 1, y: 0, z: 0 },
            y_dir: { x: 0, y: 1, z: 0 },
            segments: [
              { type: "Line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
              { type: "Line", start: { x: 10, y: 0 }, end: { x: 10, y: 5 } },
              { type: "Line", start: { x: 10, y: 5 }, end: { x: 0, y: 5 } },
              { type: "Line", start: { x: 0, y: 5 }, end: { x: 0, y: 0 } },
            ],
          },
        },
        {
          id: 2,
          name: "extruded_block",
          op: {
            type: "Extrude",
            sketch: 1,
            direction: { x: 0, y: 0, z: 20 },
          },
        },
      ],
      2,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
    // Extruded rectangle has 6 faces, 12 triangles minimum
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThanOrEqual(36);
  });

  it("evaluates revolve from rectangle sketch", () => {
    const doc = singlePartDoc(
      [
        {
          id: 1,
          name: "profile",
          op: {
            type: "Sketch2D",
            origin: { x: 5, y: 0, z: 0 },
            x_dir: { x: 1, y: 0, z: 0 },
            y_dir: { x: 0, y: 0, z: 1 },
            segments: [
              { type: "Line", start: { x: 0, y: 0 }, end: { x: 3, y: 0 } },
              { type: "Line", start: { x: 3, y: 0 }, end: { x: 3, y: 10 } },
              { type: "Line", start: { x: 3, y: 10 }, end: { x: 0, y: 10 } },
              { type: "Line", start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
            ],
          },
        },
        {
          id: 2,
          name: "revolved",
          op: {
            type: "Revolve",
            sketch: 1,
            axis_origin: { x: 0, y: 0, z: 0 },
            axis_dir: { x: 0, y: 0, z: 1 },
            angle_deg: 90,
          },
        },
      ],
      2,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("sketch node alone evaluates to empty", () => {
    const doc = singlePartDoc(
      [
        {
          id: 1,
          name: "just_sketch",
          op: {
            type: "Sketch2D",
            origin: { x: 0, y: 0, z: 0 },
            x_dir: { x: 1, y: 0, z: 0 },
            y_dir: { x: 0, y: 1, z: 0 },
            segments: [
              { type: "Line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
              { type: "Line", start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
              { type: "Line", start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
              { type: "Line", start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
            ],
          },
        },
      ],
      1,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    // Sketch alone should produce empty geometry
    expect(scene.parts[0].mesh.positions.length).toBe(0);
  });

  it("evaluates sweep with line path", () => {
    const doc = singlePartDoc(
      [
        {
          id: 1,
          name: "circle_profile",
          op: {
            type: "Sketch2D",
            origin: { x: 0, y: 0, z: 0 },
            x_dir: { x: 1, y: 0, z: 0 },
            y_dir: { x: 0, y: 1, z: 0 },
            // Approximate circle with square for simpler test
            segments: [
              { type: "Line", start: { x: -2, y: -2 }, end: { x: 2, y: -2 } },
              { type: "Line", start: { x: 2, y: -2 }, end: { x: 2, y: 2 } },
              { type: "Line", start: { x: 2, y: 2 }, end: { x: -2, y: 2 } },
              { type: "Line", start: { x: -2, y: 2 }, end: { x: -2, y: -2 } },
            ],
          },
        },
        {
          id: 2,
          name: "swept",
          op: {
            type: "Sweep",
            sketch: 1,
            path: {
              type: "Line",
              start: { x: 0, y: 0, z: 0 },
              end: { x: 0, y: 0, z: 20 },
            },
          },
        },
      ],
      2,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("evaluates sweep with helix path", () => {
    const doc = singlePartDoc(
      [
        {
          id: 1,
          name: "small_square",
          op: {
            type: "Sketch2D",
            origin: { x: 0, y: 0, z: 0 },
            x_dir: { x: 1, y: 0, z: 0 },
            y_dir: { x: 0, y: 1, z: 0 },
            segments: [
              { type: "Line", start: { x: -1, y: -1 }, end: { x: 1, y: -1 } },
              { type: "Line", start: { x: 1, y: -1 }, end: { x: 1, y: 1 } },
              { type: "Line", start: { x: 1, y: 1 }, end: { x: -1, y: 1 } },
              { type: "Line", start: { x: -1, y: 1 }, end: { x: -1, y: -1 } },
            ],
          },
        },
        {
          id: 2,
          name: "spring",
          op: {
            type: "Sweep",
            sketch: 1,
            path: {
              type: "Helix",
              radius: 10,
              pitch: 5,
              height: 20,
              turns: 2,
            },
          },
        },
      ],
      2,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("evaluates loft between two profiles", () => {
    const doc = singlePartDoc(
      [
        {
          id: 1,
          name: "profile_bottom",
          op: {
            type: "Sketch2D",
            origin: { x: 0, y: 0, z: 0 },
            x_dir: { x: 1, y: 0, z: 0 },
            y_dir: { x: 0, y: 1, z: 0 },
            segments: [
              { type: "Line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
              { type: "Line", start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
              { type: "Line", start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
              { type: "Line", start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
            ],
          },
        },
        {
          id: 2,
          name: "profile_top",
          op: {
            type: "Sketch2D",
            origin: { x: 2, y: 2, z: 20 },
            x_dir: { x: 1, y: 0, z: 0 },
            y_dir: { x: 0, y: 1, z: 0 },
            segments: [
              { type: "Line", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } },
              { type: "Line", start: { x: 6, y: 0 }, end: { x: 6, y: 6 } },
              { type: "Line", start: { x: 6, y: 6 }, end: { x: 0, y: 6 } },
              { type: "Line", start: { x: 0, y: 6 }, end: { x: 0, y: 0 } },
            ],
          },
        },
        {
          id: 3,
          name: "lofted",
          op: {
            type: "Loft",
            sketches: [1, 2],
          },
        },
      ],
      3,
    );
    const scene = engine.evaluate(doc);
    expect(scene.parts).toHaveLength(1);
    expect(scene.parts[0].mesh.positions.length).toBeGreaterThan(0);
    expect(scene.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });
});

describe("Assembly evaluation", () => {
  it("evaluates partDefs and instances", () => {
    const doc: Document = {
      version: "0.1",
      nodes: {
        "1": { id: 1, name: "cube", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
        "2": { id: 2, name: "cylinder", op: { type: "Cylinder", radius: 5, height: 20, segments: 16 } },
      },
      materials: {},
      part_materials: {},
      roots: [],
      partDefs: {
        box: { id: "box", name: "Box", root: 1, defaultMaterial: "metal" },
        rod: { id: "rod", name: "Rod", root: 2, defaultMaterial: "plastic" },
      },
      instances: [
        {
          id: "box-1",
          partDefId: "box",
          name: "Box Instance",
          transform: {
            translation: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
        {
          id: "rod-1",
          partDefId: "rod",
          name: "Rod Instance",
          transform: {
            translation: { x: 20, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      groundInstanceId: "box-1",
    };

    const scene = engine.evaluate(doc);

    // Should have partDefs
    expect(scene.partDefs).toBeDefined();
    expect(scene.partDefs).toHaveLength(2);

    // Should have instances
    expect(scene.instances).toBeDefined();
    expect(scene.instances).toHaveLength(2);

    // Check first instance
    const boxInstance = scene.instances!.find((i) => i.instanceId === "box-1");
    expect(boxInstance).toBeDefined();
    expect(boxInstance!.partDefId).toBe("box");
    expect(boxInstance!.material).toBe("metal");
    expect(boxInstance!.mesh.positions.length).toBeGreaterThan(0);

    // Check second instance
    const rodInstance = scene.instances!.find((i) => i.instanceId === "rod-1");
    expect(rodInstance).toBeDefined();
    expect(rodInstance!.partDefId).toBe("rod");
    expect(rodInstance!.material).toBe("plastic");
    expect(rodInstance!.transform?.translation.x).toBe(20);

    // No clashes (they're separated)
    expect(scene.clashes).toHaveLength(0);
  });

  it("applies kinematics for joints", () => {
    const doc: Document = {
      version: "0.1",
      nodes: {
        "1": { id: 1, name: "cube", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
      },
      materials: {},
      part_materials: {},
      roots: [],
      partDefs: {
        box: { id: "box", root: 1 },
      },
      instances: [
        {
          id: "ground",
          partDefId: "box",
          transform: {
            translation: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
        {
          id: "arm",
          partDefId: "box",
          transform: {
            translation: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      joints: [
        {
          id: "hinge",
          name: "Hinge Joint",
          parentInstanceId: "ground",
          childInstanceId: "arm",
          parentAnchor: { x: 10, y: 5, z: 5 },
          childAnchor: { x: 0, y: 5, z: 5 },
          kind: { type: "Revolute", axis: { x: 0, y: 1, z: 0 } },
          state: 0,
        },
      ],
      groundInstanceId: "ground",
    };

    const scene = engine.evaluate(doc);

    expect(scene.instances).toBeDefined();
    expect(scene.instances).toHaveLength(2);

    // Arm should be positioned relative to ground via joint
    const armInstance = scene.instances!.find((i) => i.instanceId === "arm");
    expect(armInstance).toBeDefined();
    expect(armInstance!.transform).toBeDefined();
    // With state=0 (no rotation), arm should be translated by parent-child anchor difference
    expect(armInstance!.transform!.translation.x).toBe(10); // parentAnchor.x - childAnchor.x
  });

  it("detects clashes between overlapping instances", () => {
    const doc: Document = {
      version: "0.1",
      nodes: {
        "1": { id: 1, name: "cube", op: { type: "Cube", size: { x: 10, y: 10, z: 10 } } },
      },
      materials: {},
      part_materials: {},
      roots: [],
      partDefs: {
        box: { id: "box", root: 1 },
      },
      instances: [
        {
          id: "box-1",
          partDefId: "box",
          transform: {
            translation: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
        {
          id: "box-2",
          partDefId: "box",
          transform: {
            translation: { x: 5, y: 0, z: 0 }, // Overlaps with box-1
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
    };

    const scene = engine.evaluate(doc);

    // Should detect clash between overlapping cubes
    expect(scene.clashes.length).toBeGreaterThan(0);
    expect(scene.clashes[0].positions.length).toBeGreaterThan(0);
  });
});
