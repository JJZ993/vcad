import { describe, expect, it } from "vitest";
import {
  createDocument,
  toJson,
  fromJson,
  type Node,
  type MaterialDef,
  type CsgOp,
} from "../index.js";

describe("Document", () => {
  it("roundtrips through JSON", () => {
    const doc = createDocument();

    const cube: Node = {
      id: 1,
      name: "box",
      op: { type: "Cube", size: { x: 10, y: 20, z: 30 } },
    };
    const cyl: Node = {
      id: 2,
      name: "hole",
      op: { type: "Cylinder", radius: 3, height: 40, segments: 0 },
    };
    const diff: Node = {
      id: 3,
      name: "box_with_hole",
      op: { type: "Difference", left: 1, right: 2 },
    };

    doc.nodes["1"] = cube;
    doc.nodes["2"] = cyl;
    doc.nodes["3"] = diff;

    doc.materials["aluminum"] = {
      name: "aluminum",
      color: [0.91, 0.92, 0.93],
      metallic: 1.0,
      roughness: 0.4,
      density: 2700,
      friction: 0.6,
    };

    doc.roots.push({ root: 3, material: "aluminum" });

    const json = toJson(doc);
    const restored = fromJson(json);

    expect(restored).toEqual(doc);
    expect(Object.keys(restored.nodes)).toHaveLength(3);
    expect(Object.keys(restored.materials)).toHaveLength(1);
    expect(restored.roots).toHaveLength(1);
  });

  it("discriminates CsgOp types", () => {
    const ops: CsgOp[] = [
      { type: "Cube", size: { x: 1, y: 1, z: 1 } },
      { type: "Sphere", radius: 5, segments: 0 },
      { type: "Union", left: 1, right: 2 },
      { type: "Empty" },
    ];

    expect(ops[0].type).toBe("Cube");
    expect(ops[1].type).toBe("Sphere");
    expect(ops[2].type).toBe("Union");
    expect(ops[3].type).toBe("Empty");

    // Type narrowing works
    if (ops[0].type === "Cube") {
      expect(ops[0].size.x).toBe(1);
    }
    if (ops[2].type === "Union") {
      expect(ops[2].left).toBe(1);
    }
  });

  it("creates empty document with defaults", () => {
    const doc = createDocument();
    expect(doc.version).toBe("0.1");
    expect(Object.keys(doc.nodes)).toHaveLength(0);
    expect(Object.keys(doc.materials)).toHaveLength(0);
    expect(Object.keys(doc.part_materials)).toHaveLength(0);
    expect(doc.roots).toHaveLength(0);
  });
});
