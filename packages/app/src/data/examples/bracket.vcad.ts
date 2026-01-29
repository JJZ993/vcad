import type { Example } from "./index";
import type { Document } from "@vcad/ir";
import type { PartInfo } from "@vcad/core";

// L-bracket with mounting holes - Y is UP
// Demonstrates union and difference operations
const document: Document = {
  version: "0.1",
  nodes: {
    // Base plate: 60x4x40
    "1": { id: 1, name: null, op: { type: "Cube", size: { x: 60, y: 4, z: 40 } } },

    // Wall plate: 60x36x4 (positioned at back of base, extending up)
    "2": { id: 2, name: null, op: { type: "Cube", size: { x: 60, y: 36, z: 4 } } },
    // Position wall at back of base (z = 40 - 4 = 36) and on top (y = 4)
    "3": { id: 3, name: null, op: { type: "Translate", child: 2, offset: { x: 0, y: 4, z: 36 } } },

    // Union base and wall into L-shape
    "4": { id: 4, name: null, op: { type: "Union", left: 1, right: 3 } },

    // Mounting hole template (5x20x5 rectangular holes)
    "10": { id: 10, name: null, op: { type: "Cube", size: { x: 5, y: 20, z: 5 } } },

    // Base holes - 2 holes in the base plate (vertical through base)
    // Left hole at x=12.5
    "20": { id: 20, name: null, op: { type: "Translate", child: 10, offset: { x: 10, y: -8, z: 16 } } },
    // Right hole at x=47.5
    "21": { id: 21, name: null, op: { type: "Translate", child: 10, offset: { x: 45, y: -8, z: 16 } } },

    // Wall hole template (5x5x20 - horizontal through wall)
    "11": { id: 11, name: null, op: { type: "Cube", size: { x: 5, y: 5, z: 20 } } },

    // Wall holes - 2 holes in the wall plate (horizontal through wall)
    // Left hole at x=12.5, y=22
    "22": { id: 22, name: null, op: { type: "Translate", child: 11, offset: { x: 10, y: 20, z: 30 } } },
    // Right hole at x=47.5, y=22
    "23": { id: 23, name: null, op: { type: "Translate", child: 11, offset: { x: 45, y: 20, z: 30 } } },

    // Union all holes together
    "30": { id: 30, name: null, op: { type: "Union", left: 20, right: 21 } },
    "31": { id: 31, name: null, op: { type: "Union", left: 30, right: 22 } },
    "32": { id: 32, name: null, op: { type: "Union", left: 31, right: 23 } },

    // Boolean difference: L-shape - all holes
    "40": { id: 40, name: null, op: { type: "Difference", left: 4, right: 32 } },

    // Transform the result to center it
    "50": { id: 50, name: null, op: { type: "Scale", child: 40, factor: { x: 1, y: 1, z: 1 } } },
    "51": { id: 51, name: null, op: { type: "Rotate", child: 50, angles: { x: 0, y: 0, z: 0 } } },
    "52": { id: 52, name: "L-Bracket", op: { type: "Translate", child: 51, offset: { x: -30, y: 0, z: -20 } } },
  },
  materials: {
    default: {
      name: "Default",
      color: [0.7, 0.7, 0.75],
      metallic: 0.1,
      roughness: 0.6,
    },
  },
  part_materials: {},
  roots: [{ root: 52, material: "default" }],
};

const parts: PartInfo[] = [
  {
    id: "part-1",
    name: "L-Bracket",
    kind: "cube",
    primitiveNodeId: 1,
    scaleNodeId: 50,
    rotateNodeId: 51,
    translateNodeId: 52,
  },
];

export const bracketExample: Example = {
  id: "bracket",
  name: "L-Bracket",
  description: "An L-shaped mounting bracket with holes. Demonstrates union and boolean difference.",
  difficulty: "beginner",
  thumbnail: "/assets/bracket.png",
  features: ["Multi-part", "Union", "Boolean Difference"],
  unlockAfter: 0,
  file: {
    document,
    parts,
    consumedParts: {},
    nextNodeId: 53,
    nextPartNum: 2,
  },
};
