import type { Example } from "./index";
import type { Document } from "@vcad/ir";
import type { PartInfo } from "@vcad/core";

// Robot mascot - Y is UP, Z is toward camera
// Cubes have corner at origin, spheres are centered
const document: Document = {
  version: "0.1",
  nodes: {
    // Body - 24x32x20 cube (width x height x depth), centered in XZ, bottom at y=8
    "1": { id: 1, name: null, op: { type: "Cube", size: { x: 24, y: 32, z: 20 } } },
    "2": { id: 2, name: null, op: { type: "Scale", child: 1, factor: { x: 1, y: 1, z: 1 } } },
    "3": { id: 3, name: null, op: { type: "Rotate", child: 2, angles: { x: 0, y: 0, z: 0 } } },
    "4": { id: 4, name: "Body", op: { type: "Translate", child: 3, offset: { x: -12, y: 8, z: -10 } } },

    // Head - sphere radius 12, on top of body at y=48
    "5": { id: 5, name: null, op: { type: "Sphere", radius: 12, segments: 32 } },
    "6": { id: 6, name: null, op: { type: "Scale", child: 5, factor: { x: 1, y: 1, z: 1 } } },
    "7": { id: 7, name: null, op: { type: "Rotate", child: 6, angles: { x: 0, y: 0, z: 0 } } },
    "8": { id: 8, name: "Head", op: { type: "Translate", child: 7, offset: { x: 0, y: 48, z: 0 } } },

    // Left Eye - at front of head (+Z direction)
    "9": { id: 9, name: null, op: { type: "Sphere", radius: 2.5, segments: 16 } },
    "10": { id: 10, name: null, op: { type: "Scale", child: 9, factor: { x: 1, y: 1, z: 1 } } },
    "11": { id: 11, name: null, op: { type: "Rotate", child: 10, angles: { x: 0, y: 0, z: 0 } } },
    "12": { id: 12, name: "Left Eye", op: { type: "Translate", child: 11, offset: { x: -4, y: 50, z: 10 } } },

    // Right Eye
    "13": { id: 13, name: null, op: { type: "Sphere", radius: 2.5, segments: 16 } },
    "14": { id: 14, name: null, op: { type: "Scale", child: 13, factor: { x: 1, y: 1, z: 1 } } },
    "15": { id: 15, name: null, op: { type: "Rotate", child: 14, angles: { x: 0, y: 0, z: 0 } } },
    "16": { id: 16, name: "Right Eye", op: { type: "Translate", child: 15, offset: { x: 4, y: 50, z: 10 } } },

    // Left Pupil
    "17": { id: 17, name: null, op: { type: "Sphere", radius: 1.2, segments: 12 } },
    "18": { id: 18, name: null, op: { type: "Scale", child: 17, factor: { x: 1, y: 1, z: 1 } } },
    "19": { id: 19, name: null, op: { type: "Rotate", child: 18, angles: { x: 0, y: 0, z: 0 } } },
    "20": { id: 20, name: "Left Pupil", op: { type: "Translate", child: 19, offset: { x: -4, y: 50, z: 12 } } },

    // Right Pupil
    "21": { id: 21, name: null, op: { type: "Sphere", radius: 1.2, segments: 12 } },
    "22": { id: 22, name: null, op: { type: "Scale", child: 21, factor: { x: 1, y: 1, z: 1 } } },
    "23": { id: 23, name: null, op: { type: "Rotate", child: 22, angles: { x: 0, y: 0, z: 0 } } },
    "24": { id: 24, name: "Right Pupil", op: { type: "Translate", child: 23, offset: { x: 4, y: 50, z: 12 } } },

    // Antenna - on top of head
    "25": { id: 25, name: null, op: { type: "Sphere", radius: 3, segments: 16 } },
    "26": { id: 26, name: null, op: { type: "Scale", child: 25, factor: { x: 1, y: 1, z: 1 } } },
    "27": { id: 27, name: null, op: { type: "Rotate", child: 26, angles: { x: 0, y: 0, z: 0 } } },
    "28": { id: 28, name: "Antenna", op: { type: "Translate", child: 27, offset: { x: 0, y: 64, z: 0 } } },

    // Left Hand - at side of body
    "29": { id: 29, name: null, op: { type: "Sphere", radius: 4, segments: 16 } },
    "30": { id: 30, name: null, op: { type: "Scale", child: 29, factor: { x: 1, y: 1, z: 1 } } },
    "31": { id: 31, name: null, op: { type: "Rotate", child: 30, angles: { x: 0, y: 0, z: 0 } } },
    "32": { id: 32, name: "Left Hand", op: { type: "Translate", child: 31, offset: { x: -18, y: 24, z: 0 } } },

    // Right Hand
    "33": { id: 33, name: null, op: { type: "Sphere", radius: 4, segments: 16 } },
    "34": { id: 34, name: null, op: { type: "Scale", child: 33, factor: { x: 1, y: 1, z: 1 } } },
    "35": { id: 35, name: null, op: { type: "Rotate", child: 34, angles: { x: 0, y: 0, z: 0 } } },
    "36": { id: 36, name: "Right Hand", op: { type: "Translate", child: 35, offset: { x: 18, y: 24, z: 0 } } },

    // Left Foot - on ground (y=0)
    "37": { id: 37, name: null, op: { type: "Cube", size: { x: 8, y: 4, z: 10 } } },
    "38": { id: 38, name: null, op: { type: "Scale", child: 37, factor: { x: 1, y: 1, z: 1 } } },
    "39": { id: 39, name: null, op: { type: "Rotate", child: 38, angles: { x: 0, y: 0, z: 0 } } },
    "40": { id: 40, name: "Left Foot", op: { type: "Translate", child: 39, offset: { x: -10, y: 0, z: -5 } } },

    // Right Foot
    "41": { id: 41, name: null, op: { type: "Cube", size: { x: 8, y: 4, z: 10 } } },
    "42": { id: 42, name: null, op: { type: "Scale", child: 41, factor: { x: 1, y: 1, z: 1 } } },
    "43": { id: 43, name: null, op: { type: "Rotate", child: 42, angles: { x: 0, y: 0, z: 0 } } },
    "44": { id: 44, name: "Right Foot", op: { type: "Translate", child: 43, offset: { x: 2, y: 0, z: -5 } } },

    // Left Leg
    "45": { id: 45, name: null, op: { type: "Cube", size: { x: 6, y: 4, z: 6 } } },
    "46": { id: 46, name: null, op: { type: "Scale", child: 45, factor: { x: 1, y: 1, z: 1 } } },
    "47": { id: 47, name: null, op: { type: "Rotate", child: 46, angles: { x: 0, y: 0, z: 0 } } },
    "48": { id: 48, name: "Left Leg", op: { type: "Translate", child: 47, offset: { x: -9, y: 4, z: -3 } } },

    // Right Leg
    "49": { id: 49, name: null, op: { type: "Cube", size: { x: 6, y: 4, z: 6 } } },
    "50": { id: 50, name: null, op: { type: "Scale", child: 49, factor: { x: 1, y: 1, z: 1 } } },
    "51": { id: 51, name: null, op: { type: "Rotate", child: 50, angles: { x: 0, y: 0, z: 0 } } },
    "52": { id: 52, name: "Right Leg", op: { type: "Translate", child: 51, offset: { x: 3, y: 4, z: -3 } } },
  },
  materials: {
    body: {
      name: "Body",
      color: [0.32, 0.72, 0.95],
      metallic: 0.1,
      roughness: 0.5,
    },
    eye_white: {
      name: "Eye White",
      color: [1.0, 1.0, 1.0],
      metallic: 0.0,
      roughness: 0.2,
    },
    pupil: {
      name: "Pupil",
      color: [0.08, 0.08, 0.12],
      metallic: 0.0,
      roughness: 0.3,
    },
    antenna: {
      name: "Antenna",
      color: [0.95, 0.3, 0.35],
      metallic: 0.3,
      roughness: 0.4,
    },
    hand: {
      name: "Hand",
      color: [0.95, 0.95, 0.97],
      metallic: 0.0,
      roughness: 0.4,
    },
  },
  part_materials: {},
  roots: [
    { root: 4, material: "body" },
    { root: 8, material: "body" },
    { root: 12, material: "eye_white" },
    { root: 16, material: "eye_white" },
    { root: 20, material: "pupil" },
    { root: 24, material: "pupil" },
    { root: 28, material: "antenna" },
    { root: 32, material: "hand" },
    { root: 36, material: "hand" },
    { root: 40, material: "hand" },
    { root: 44, material: "hand" },
    { root: 48, material: "body" },
    { root: 52, material: "body" },
  ],
};

const parts: PartInfo[] = [
  { id: "part-1", name: "Body", kind: "cube", primitiveNodeId: 1, scaleNodeId: 2, rotateNodeId: 3, translateNodeId: 4 },
  { id: "part-2", name: "Head", kind: "sphere", primitiveNodeId: 5, scaleNodeId: 6, rotateNodeId: 7, translateNodeId: 8 },
  { id: "part-3", name: "Left Eye", kind: "sphere", primitiveNodeId: 9, scaleNodeId: 10, rotateNodeId: 11, translateNodeId: 12 },
  { id: "part-4", name: "Right Eye", kind: "sphere", primitiveNodeId: 13, scaleNodeId: 14, rotateNodeId: 15, translateNodeId: 16 },
  { id: "part-5", name: "Left Pupil", kind: "sphere", primitiveNodeId: 17, scaleNodeId: 18, rotateNodeId: 19, translateNodeId: 20 },
  { id: "part-6", name: "Right Pupil", kind: "sphere", primitiveNodeId: 21, scaleNodeId: 22, rotateNodeId: 23, translateNodeId: 24 },
  { id: "part-7", name: "Antenna", kind: "sphere", primitiveNodeId: 25, scaleNodeId: 26, rotateNodeId: 27, translateNodeId: 28 },
  { id: "part-8", name: "Left Hand", kind: "sphere", primitiveNodeId: 29, scaleNodeId: 30, rotateNodeId: 31, translateNodeId: 32 },
  { id: "part-9", name: "Right Hand", kind: "sphere", primitiveNodeId: 33, scaleNodeId: 34, rotateNodeId: 35, translateNodeId: 36 },
  { id: "part-10", name: "Left Foot", kind: "cube", primitiveNodeId: 37, scaleNodeId: 38, rotateNodeId: 39, translateNodeId: 40 },
  { id: "part-11", name: "Right Foot", kind: "cube", primitiveNodeId: 41, scaleNodeId: 42, rotateNodeId: 43, translateNodeId: 44 },
  { id: "part-12", name: "Left Leg", kind: "cube", primitiveNodeId: 45, scaleNodeId: 46, rotateNodeId: 47, translateNodeId: 48 },
  { id: "part-13", name: "Right Leg", kind: "cube", primitiveNodeId: 49, scaleNodeId: 50, rotateNodeId: 51, translateNodeId: 52 },
];

export const mascotExample: Example = {
  id: "mascot",
  name: "Mascot",
  file: {
    document,
    parts,
    consumedParts: {},
    nextNodeId: 53,
    nextPartNum: 14,
  },
};
