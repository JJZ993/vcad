import { describe, it, expect } from "vitest";
import { createDocument } from "@vcad/ir";
import { deriveParts } from "../utils/save-load.js";

function makeDoc(nodes: Record<string, unknown>, rootId: number) {
  const doc = createDocument();
  doc.nodes = nodes as typeof doc.nodes;
  doc.roots = [{ root: rootId, material: "default" }];
  return doc;
}

describe("deriveParts transform chain", () => {
  it("handles root Rotate -> Cube", () => {
    const doc = makeDoc(
      {
        "1": {
          id: 1,
          name: "Root",
          op: { type: "Rotate", child: 2, angles: { x: 0, y: 0, z: 0 } },
        },
        "2": {
          id: 2,
          name: "Cube",
          op: { type: "Cube", size: { x: 1, y: 2, z: 3 } },
        },
      },
      1,
    );

    const parts = deriveParts(doc);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.kind).toBe("cube");
    expect(parts[0]!.primitiveNodeId).toBe(2);
    expect(parts[0]!.translateNodeId).toBe(1);
    expect(parts[0]!.rotateNodeId).toBe(1);
  });

  it("handles root Scale -> Cube", () => {
    const doc = makeDoc(
      {
        "1": {
          id: 1,
          name: "Root",
          op: { type: "Scale", child: 2, factor: { x: 1, y: 1, z: 1 } },
        },
        "2": {
          id: 2,
          name: "Cube",
          op: { type: "Cube", size: { x: 2, y: 2, z: 2 } },
        },
      },
      1,
    );

    const parts = deriveParts(doc);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.kind).toBe("cube");
    expect(parts[0]!.primitiveNodeId).toBe(2);
    expect(parts[0]!.scaleNodeId).toBe(1);
    expect(parts[0]!.translateNodeId).toBe(1);
  });

  it("handles Translate -> Rotate -> Scale -> Cube", () => {
    const doc = makeDoc(
      {
        "1": {
          id: 1,
          name: "Root",
          op: {
            type: "Translate",
            child: 2,
            offset: { x: 1, y: 2, z: 3 },
          },
        },
        "2": {
          id: 2,
          name: "Rotate",
          op: { type: "Rotate", child: 3, angles: { x: 0, y: 0, z: 0 } },
        },
        "3": {
          id: 3,
          name: "Scale",
          op: { type: "Scale", child: 4, factor: { x: 1, y: 1, z: 1 } },
        },
        "4": {
          id: 4,
          name: "Cube",
          op: { type: "Cube", size: { x: 4, y: 5, z: 6 } },
        },
      },
      1,
    );

    const parts = deriveParts(doc);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.kind).toBe("cube");
    expect(parts[0]!.primitiveNodeId).toBe(4);
    expect(parts[0]!.translateNodeId).toBe(1);
    expect(parts[0]!.rotateNodeId).toBe(2);
    expect(parts[0]!.scaleNodeId).toBe(3);
  });
});
