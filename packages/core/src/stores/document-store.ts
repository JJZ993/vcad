import { create } from "zustand";
import type {
  Document,
  NodeId,
  CsgOp,
  Node,
  Vec3,
  SketchSegment2D,
  PathCurve,
  Transform3D,
  SweepOp,
  JointKind,
  Instance,
  Joint,
  PartDef,
} from "@vcad/ir";
import { createDocument, identityTransform } from "@vcad/ir";
import type {
  PartInfo,
  PrimitiveKind,
  BooleanType,
  BooleanPartInfo,
  ExtrudePartInfo,
  RevolvePartInfo,
  SweepPartInfo,
  LoftPartInfo,
  SketchPlane,
} from "../types.js";
import {
  isPrimitivePart,
  isBooleanPart,
  isExtrudePart,
  isRevolvePart,
  isSweepPart,
  isLoftPart,
  getSketchPlaneDirections,
} from "../types.js";

const MAX_UNDO = 50;

interface Snapshot {
  document: string; // JSON-serialized Document
  parts: PartInfo[];
  consumedParts: Record<string, PartInfo>;
  nextNodeId: number;
  nextPartNum: number;
  actionName: string; // Describes what action created this snapshot
}

export interface VcadFile {
  document: Document;
  parts: PartInfo[];
  consumedParts?: Record<string, PartInfo>;
  nextNodeId: number;
  nextPartNum: number;
}

export interface DocumentState {
  document: Document;
  parts: PartInfo[];
  consumedParts: Record<string, PartInfo>; // Parts consumed by booleans, keyed by id
  nextNodeId: number;
  nextPartNum: number;
  isDirty: boolean;

  // undo/redo
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  // mutations
  addPrimitive: (kind: PrimitiveKind) => string;
  removePart: (partId: string) => void;
  setTranslation: (partId: string, offset: Vec3, skipUndo?: boolean) => void;
  setRotation: (partId: string, angles: Vec3, skipUndo?: boolean) => void;
  setScale: (partId: string, factor: Vec3, skipUndo?: boolean) => void;
  updatePrimitiveOp: (partId: string, op: CsgOp, skipUndo?: boolean) => void;
  updateSweepOp: (
    partId: string,
    updates: Partial<SweepOp>,
    skipUndo?: boolean,
  ) => void;
  renamePart: (partId: string, name: string) => void;
  applyBoolean: (
    type: BooleanType,
    partIdA: string,
    partIdB: string,
  ) => string | null;
  duplicateParts: (partIds: string[]) => string[];
  loadDocument: (file: VcadFile) => void;
  addExtrude: (
    plane: SketchPlane,
    origin: Vec3,
    segments: SketchSegment2D[],
    direction: Vec3,
  ) => string | null;
  addRevolve: (
    plane: SketchPlane,
    origin: Vec3,
    segments: SketchSegment2D[],
    axisOrigin: Vec3,
    axisDir: Vec3,
    angleDeg: number,
  ) => string | null;
  addSweep: (
    plane: SketchPlane,
    origin: Vec3,
    segments: SketchSegment2D[],
    path: PathCurve,
    options?: {
      twist_angle?: number;
      scale_start?: number;
      scale_end?: number;
    },
  ) => string | null;
  addLoft: (
    profiles: Array<{
      plane: SketchPlane;
      origin: Vec3;
      segments: SketchSegment2D[];
    }>,
    options?: { closed?: boolean },
  ) => string | null;
  setPartMaterial: (partId: string, materialKey: string) => void;
  pushUndoSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  // Assembly operations
  setInstanceTransform: (
    instanceId: string,
    transform: Transform3D,
    skipUndo?: boolean,
  ) => void;
  setInstanceMaterial: (instanceId: string, materialKey: string) => void;
  setJointState: (jointId: string, state: number, skipUndo?: boolean) => void;
  createPartDef: (partId: string, name?: string) => string | null;
  createInstance: (
    partDefId: string,
    name?: string,
    transform?: Transform3D,
  ) => string;
  addJoint: (config: {
    parentInstanceId: string | null;
    childInstanceId: string;
    parentAnchor: Vec3;
    childAnchor: Vec3;
    kind: JointKind;
    name?: string;
  }) => string;
  deleteInstance: (instanceId: string) => void;
  deleteJoint: (jointId: string) => void;
  setGroundInstance: (instanceId: string) => void;
  renameInstance: (instanceId: string, name: string) => void;
}

function makeNode(id: NodeId, name: string | null, op: CsgOp): Node {
  return { id, name, op };
}

function snapshot(state: DocumentState, actionName: string): Snapshot {
  return {
    document: JSON.stringify(state.document),
    parts: state.parts.map((p) => ({ ...p })),
    consumedParts: { ...state.consumedParts },
    nextNodeId: state.nextNodeId,
    nextPartNum: state.nextPartNum,
    actionName,
  };
}

function pushUndo(
  state: DocumentState,
  actionName: string,
): Pick<DocumentState, "undoStack" | "redoStack"> {
  const snap = snapshot(state, actionName);
  const stack = [...state.undoStack, snap];
  if (stack.length > MAX_UNDO) stack.shift();
  return { undoStack: stack, redoStack: [] };
}

// Selectors for undo/redo action names
export function getUndoActionName(state: DocumentState): string | null {
  const stack = state.undoStack;
  if (stack.length === 0) return null;
  return stack[stack.length - 1]!.actionName;
}

export function getRedoActionName(state: DocumentState): string | null {
  const stack = state.redoStack;
  if (stack.length === 0) return null;
  return stack[stack.length - 1]!.actionName;
}

const DEFAULT_SIZES: Record<PrimitiveKind, CsgOp> = {
  cube: { type: "Cube", size: { x: 20, y: 20, z: 20 } },
  cylinder: { type: "Cylinder", radius: 10, height: 20, segments: 64 },
  sphere: { type: "Sphere", radius: 10, segments: 64 },
};

const KIND_LABELS: Record<PrimitiveKind, string> = {
  cube: "Box",
  cylinder: "Cylinder",
  sphere: "Sphere",
};

export const useDocumentStore = create<DocumentState>((set, get) => ({
  document: createDocument(),
  parts: [],
  consumedParts: {},
  nextNodeId: 1,
  nextPartNum: 1,
  isDirty: false,
  undoStack: [],
  redoStack: [],

  pushUndoSnapshot: () => {
    set((s) => pushUndo(s, "Edit"));
  },

  addPrimitive: (kind) => {
    const state = get();
    let nid = state.nextNodeId;
    const partNum = state.nextPartNum;

    const primitiveId = nid++;
    const scaleId = nid++;
    const rotateId = nid++;
    const translateId = nid++;

    const primOp = DEFAULT_SIZES[kind];
    const scaleOp: CsgOp = {
      type: "Scale",
      child: primitiveId,
      factor: { x: 1, y: 1, z: 1 },
    };
    const rotateOp: CsgOp = {
      type: "Rotate",
      child: scaleId,
      angles: { x: 0, y: 0, z: 0 },
    };
    const translateOp: CsgOp = {
      type: "Translate",
      child: rotateId,
      offset: { x: 0, y: 0, z: 0 },
    };

    const partId = `part-${partNum}`;
    const name = `${KIND_LABELS[kind]} ${partNum}`;

    const newDoc = structuredClone(state.document);
    newDoc.nodes[String(primitiveId)] = makeNode(primitiveId, null, primOp);
    newDoc.nodes[String(scaleId)] = makeNode(scaleId, null, scaleOp);
    newDoc.nodes[String(rotateId)] = makeNode(rotateId, null, rotateOp);
    newDoc.nodes[String(translateId)] = makeNode(
      translateId,
      name,
      translateOp,
    );
    newDoc.roots.push({ root: translateId, material: "default" });

    if (!newDoc.materials["default"]) {
      newDoc.materials["default"] = {
        name: "Default",
        color: [0.55, 0.55, 0.55],
        metallic: 0.0,
        roughness: 0.7,
      };
    }

    const partInfo: PartInfo = {
      id: partId,
      name,
      kind,
      primitiveNodeId: primitiveId,
      scaleNodeId: scaleId,
      rotateNodeId: rotateId,
      translateNodeId: translateId,
    };

    const undoState = pushUndo(state, `Add ${KIND_LABELS[kind]}`);

    set({
      document: newDoc,
      parts: [...state.parts, partInfo],
      nextNodeId: nid,
      nextPartNum: partNum + 1,
      isDirty: true,
      ...undoState,
    });

    return partId;
  },

  removePart: (partId) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part) return;

    const undoState = pushUndo(state, `Delete ${part.name}`);
    const newDoc = structuredClone(state.document);

    // Remove nodes based on part type
    if (isPrimitivePart(part)) {
      delete newDoc.nodes[String(part.primitiveNodeId)];
    } else if (isBooleanPart(part)) {
      delete newDoc.nodes[String(part.booleanNodeId)];
    } else if (isExtrudePart(part)) {
      delete newDoc.nodes[String(part.sketchNodeId)];
      delete newDoc.nodes[String(part.extrudeNodeId)];
    } else if (isRevolvePart(part)) {
      delete newDoc.nodes[String(part.sketchNodeId)];
      delete newDoc.nodes[String(part.revolveNodeId)];
    } else if (isSweepPart(part)) {
      delete newDoc.nodes[String(part.sketchNodeId)];
      delete newDoc.nodes[String(part.sweepNodeId)];
    } else if (isLoftPart(part)) {
      for (const sketchId of part.sketchNodeIds) {
        delete newDoc.nodes[String(sketchId)];
      }
      delete newDoc.nodes[String(part.loftNodeId)];
    }
    delete newDoc.nodes[String(part.scaleNodeId)];
    delete newDoc.nodes[String(part.rotateNodeId)];
    delete newDoc.nodes[String(part.translateNodeId)];

    // Remove scene root
    newDoc.roots = newDoc.roots.filter((r) => r.root !== part.translateNodeId);

    set({
      document: newDoc,
      parts: state.parts.filter((p) => p.id !== partId),
      isDirty: true,
      ...undoState,
    });
  },

  setTranslation: (partId, offset, skipUndo) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part) return;

    const undoState = skipUndo ? {} : pushUndo(state, "Transform");
    const newDoc = structuredClone(state.document);
    const node = newDoc.nodes[String(part.translateNodeId)];
    if (node && node.op.type === "Translate") {
      node.op.offset = offset;
    }

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  setRotation: (partId, angles, skipUndo) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part) return;

    const undoState = skipUndo ? {} : pushUndo(state, "Transform");
    const newDoc = structuredClone(state.document);
    const node = newDoc.nodes[String(part.rotateNodeId)];
    if (node && node.op.type === "Rotate") {
      node.op.angles = angles;
    }

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  setScale: (partId, factor, skipUndo) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part) return;

    const undoState = skipUndo ? {} : pushUndo(state, "Transform");
    const newDoc = structuredClone(state.document);
    const node = newDoc.nodes[String(part.scaleNodeId)];
    if (node && node.op.type === "Scale") {
      node.op.factor = factor;
    }

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  updatePrimitiveOp: (partId, op, skipUndo) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part || !isPrimitivePart(part)) return;

    const undoState = skipUndo ? {} : pushUndo(state, "Edit Properties");
    const newDoc = structuredClone(state.document);
    const node = newDoc.nodes[String(part.primitiveNodeId)];
    if (node) {
      node.op = op;
    }

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  updateSweepOp: (partId, updates, skipUndo) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part || !isSweepPart(part)) return;

    const undoState = skipUndo ? {} : pushUndo(state, "Edit Sweep");
    const newDoc = structuredClone(state.document);
    const node = newDoc.nodes[String(part.sweepNodeId)];
    if (node && node.op.type === "Sweep") {
      // Merge updates into the existing op
      node.op = { ...node.op, ...updates };
    }

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  applyBoolean: (type, partIdA, partIdB) => {
    const state = get();
    const partA = state.parts.find((p) => p.id === partIdA);
    const partB = state.parts.find((p) => p.id === partIdB);
    if (!partA || !partB) return null;

    console.group("[BOOL] applyBoolean called");
    console.log("type:", type);
    console.log("partA:", JSON.stringify(partA, null, 2));
    console.log("partB:", JSON.stringify(partB, null, 2));
    console.log("state.parts:", state.parts.map(p => ({ id: p.id, name: p.name, translateNodeId: p.translateNodeId })));
    console.log("state.document.roots BEFORE:", JSON.stringify(state.document.roots, null, 2));

    let nid = state.nextNodeId;
    const partNum = state.nextPartNum;

    const BOOL_OPS: Record<BooleanType, string> = {
      union: "Union",
      difference: "Difference",
      intersection: "Intersection",
    };

    const booleanId = nid++;
    const scaleId = nid++;
    const rotateId = nid++;
    const translateId = nid++;

    console.log("New node IDs - boolean:", booleanId, "scale:", scaleId, "rotate:", rotateId, "translate:", translateId);

    const boolOp: CsgOp = {
      type: BOOL_OPS[type] as "Union" | "Difference" | "Intersection",
      left: partA.translateNodeId,
      right: partB.translateNodeId,
    } as CsgOp;

    console.log("boolOp:", JSON.stringify(boolOp, null, 2));

    const scaleOp: CsgOp = {
      type: "Scale",
      child: booleanId,
      factor: { x: 1, y: 1, z: 1 },
    };
    const rotateOp: CsgOp = {
      type: "Rotate",
      child: scaleId,
      angles: { x: 0, y: 0, z: 0 },
    };
    const translateOp: CsgOp = {
      type: "Translate",
      child: rotateId,
      offset: { x: 0, y: 0, z: 0 },
    };

    const BOOL_LABELS: Record<BooleanType, string> = {
      union: "Union",
      difference: "Difference",
      intersection: "Intersection",
    };

    const partId = `part-${partNum}`;
    const name = `${BOOL_LABELS[type]} ${partNum}`;

    const undoState = pushUndo(state, BOOL_LABELS[type]);
    const newDoc = structuredClone(state.document);

    newDoc.nodes[String(booleanId)] = makeNode(booleanId, null, boolOp);
    newDoc.nodes[String(scaleId)] = makeNode(scaleId, null, scaleOp);
    newDoc.nodes[String(rotateId)] = makeNode(rotateId, null, rotateOp);
    newDoc.nodes[String(translateId)] = makeNode(
      translateId,
      name,
      translateOp,
    );

    // Remove source parts from roots (nodes stay for DAG references)
    console.log("Filtering roots - looking for translateNodeIds:", partA.translateNodeId, "and", partB.translateNodeId);
    console.log("Root values to compare:", newDoc.roots.map(r => ({ root: r.root, rootType: typeof r.root })));
    console.log("partA.translateNodeId type:", typeof partA.translateNodeId);
    console.log("partB.translateNodeId type:", typeof partB.translateNodeId);

    // Log each filter decision
    newDoc.roots.forEach((r, i) => {
      const keepA = r.root !== partA.translateNodeId;
      const keepB = r.root !== partB.translateNodeId;
      console.log(`Root[${i}] root=${r.root}: keepA=${keepA} (${r.root} !== ${partA.translateNodeId}), keepB=${keepB} (${r.root} !== ${partB.translateNodeId}), KEEP=${keepA && keepB}`);
    });

    newDoc.roots = newDoc.roots.filter(
      (r) =>
        r.root !== partA.translateNodeId && r.root !== partB.translateNodeId,
    );
    console.log("roots AFTER filter:", JSON.stringify(newDoc.roots, null, 2));
    newDoc.roots.push({ root: translateId, material: "default" });
    console.log("roots FINAL (after adding boolean):", JSON.stringify(newDoc.roots, null, 2));
    console.groupEnd();

    const boolPartInfo: BooleanPartInfo = {
      id: partId,
      name,
      kind: "boolean",
      booleanType: type,
      booleanNodeId: booleanId,
      scaleNodeId: scaleId,
      rotateNodeId: rotateId,
      translateNodeId: translateId,
      sourcePartIds: [partIdA, partIdB],
    };

    // Remove source parts from parts list, add boolean result
    // But preserve them in consumedParts for tree display
    const newConsumedParts = { ...state.consumedParts };
    newConsumedParts[partIdA] = partA;
    newConsumedParts[partIdB] = partB;

    const newParts = state.parts.filter(
      (p) => p.id !== partIdA && p.id !== partIdB,
    );
    newParts.push(boolPartInfo);

    set({
      document: newDoc,
      parts: newParts,
      consumedParts: newConsumedParts,
      nextNodeId: nid,
      nextPartNum: partNum + 1,
      isDirty: true,
      ...undoState,
    });

    return partId;
  },

  duplicateParts: (partIds) => {
    const state = get();
    const partsToClone = state.parts.filter((p) => partIds.includes(p.id));
    if (partsToClone.length === 0) return [];

    let nid = state.nextNodeId;
    let pnum = state.nextPartNum;
    const undoState = pushUndo(state, "Duplicate");
    const newDoc = structuredClone(state.document);
    const newParts = [...state.parts];
    const newIds: string[] = [];

    for (const srcPart of partsToClone) {
      // Build a map of old node IDs to new node IDs for this part's subgraph
      const idMap = new Map<NodeId, NodeId>();

      // Collect all node IDs that belong to this part
      const nodeIdsToClone: NodeId[] = [];
      if (isPrimitivePart(srcPart)) {
        nodeIdsToClone.push(srcPart.primitiveNodeId);
      } else if (isBooleanPart(srcPart)) {
        // For boolean parts, we need the boolean node (the source nodes stay shared)
        nodeIdsToClone.push(srcPart.booleanNodeId);
      } else if (isExtrudePart(srcPart)) {
        nodeIdsToClone.push(srcPart.sketchNodeId, srcPart.extrudeNodeId);
      } else if (isRevolvePart(srcPart)) {
        nodeIdsToClone.push(srcPart.sketchNodeId, srcPart.revolveNodeId);
      } else if (isSweepPart(srcPart)) {
        nodeIdsToClone.push(srcPart.sketchNodeId, srcPart.sweepNodeId);
      } else if (isLoftPart(srcPart)) {
        nodeIdsToClone.push(...srcPart.sketchNodeIds, srcPart.loftNodeId);
      }
      nodeIdsToClone.push(
        srcPart.scaleNodeId,
        srcPart.rotateNodeId,
        srcPart.translateNodeId,
      );

      // Allocate new IDs
      for (const oldId of nodeIdsToClone) {
        idMap.set(oldId, nid++);
      }

      // Clone nodes with remapped IDs
      for (const oldId of nodeIdsToClone) {
        const oldNode = newDoc.nodes[String(oldId)];
        if (!oldNode) continue;

        const newId = idMap.get(oldId)!;
        const clonedOp = structuredClone(oldNode.op);

        // Remap child references
        if ("child" in clonedOp && typeof clonedOp.child === "number") {
          clonedOp.child = idMap.get(clonedOp.child) ?? clonedOp.child;
        }
        if ("left" in clonedOp && typeof clonedOp.left === "number") {
          clonedOp.left = idMap.get(clonedOp.left) ?? clonedOp.left;
        }
        if ("right" in clonedOp && typeof clonedOp.right === "number") {
          clonedOp.right = idMap.get(clonedOp.right) ?? clonedOp.right;
        }
        if ("sketch" in clonedOp && typeof clonedOp.sketch === "number") {
          clonedOp.sketch = idMap.get(clonedOp.sketch) ?? clonedOp.sketch;
        }
        if ("sketches" in clonedOp && Array.isArray(clonedOp.sketches)) {
          clonedOp.sketches = clonedOp.sketches.map(
            (id: number) => idMap.get(id) ?? id,
          );
        }

        newDoc.nodes[String(newId)] = makeNode(newId, oldNode.name, clonedOp);
      }

      // Offset the clone by +10mm on X
      const newTranslateId = idMap.get(srcPart.translateNodeId)!;
      const newTranslateNode = newDoc.nodes[String(newTranslateId)];
      if (newTranslateNode?.op.type === "Translate") {
        newTranslateNode.op.offset = {
          ...newTranslateNode.op.offset,
          x: newTranslateNode.op.offset.x + 10,
        };
      }

      // Add to roots
      newDoc.roots.push({ root: newTranslateId, material: "default" });

      // Build new PartInfo
      const partId = `part-${pnum}`;
      const partName = `${srcPart.name} copy`;

      if (newTranslateNode) newTranslateNode.name = partName;

      let clonedPartInfo: PartInfo;
      if (isPrimitivePart(srcPart)) {
        clonedPartInfo = {
          id: partId,
          name: partName,
          kind: srcPart.kind,
          primitiveNodeId: idMap.get(srcPart.primitiveNodeId)!,
          scaleNodeId: idMap.get(srcPart.scaleNodeId)!,
          rotateNodeId: idMap.get(srcPart.rotateNodeId)!,
          translateNodeId: newTranslateId,
        };
      } else if (isBooleanPart(srcPart)) {
        clonedPartInfo = {
          id: partId,
          name: partName,
          kind: "boolean",
          booleanType: srcPart.booleanType,
          booleanNodeId: idMap.get(srcPart.booleanNodeId)!,
          scaleNodeId: idMap.get(srcPart.scaleNodeId)!,
          rotateNodeId: idMap.get(srcPart.rotateNodeId)!,
          translateNodeId: newTranslateId,
          sourcePartIds: srcPart.sourcePartIds,
        };
      } else if (isExtrudePart(srcPart)) {
        clonedPartInfo = {
          id: partId,
          name: partName,
          kind: "extrude",
          sketchNodeId: idMap.get(srcPart.sketchNodeId)!,
          extrudeNodeId: idMap.get(srcPart.extrudeNodeId)!,
          scaleNodeId: idMap.get(srcPart.scaleNodeId)!,
          rotateNodeId: idMap.get(srcPart.rotateNodeId)!,
          translateNodeId: newTranslateId,
        };
      } else if (isRevolvePart(srcPart)) {
        clonedPartInfo = {
          id: partId,
          name: partName,
          kind: "revolve",
          sketchNodeId: idMap.get(srcPart.sketchNodeId)!,
          revolveNodeId: idMap.get(srcPart.revolveNodeId)!,
          scaleNodeId: idMap.get(srcPart.scaleNodeId)!,
          rotateNodeId: idMap.get(srcPart.rotateNodeId)!,
          translateNodeId: newTranslateId,
        };
      } else if (isSweepPart(srcPart)) {
        clonedPartInfo = {
          id: partId,
          name: partName,
          kind: "sweep",
          sketchNodeId: idMap.get(srcPart.sketchNodeId)!,
          sweepNodeId: idMap.get(srcPart.sweepNodeId)!,
          scaleNodeId: idMap.get(srcPart.scaleNodeId)!,
          rotateNodeId: idMap.get(srcPart.rotateNodeId)!,
          translateNodeId: newTranslateId,
        };
      } else {
        // isLoftPart
        const loftSrc = srcPart as LoftPartInfo;
        clonedPartInfo = {
          id: partId,
          name: partName,
          kind: "loft",
          sketchNodeIds: loftSrc.sketchNodeIds.map((id) => idMap.get(id)!),
          loftNodeId: idMap.get(loftSrc.loftNodeId)!,
          scaleNodeId: idMap.get(loftSrc.scaleNodeId)!,
          rotateNodeId: idMap.get(loftSrc.rotateNodeId)!,
          translateNodeId: newTranslateId,
        };
      }

      newParts.push(clonedPartInfo);
      newIds.push(partId);
      pnum++;
    }

    set({
      document: newDoc,
      parts: newParts,
      nextNodeId: nid,
      nextPartNum: pnum,
      isDirty: true,
      ...undoState,
    });

    return newIds;
  },

  loadDocument: (file) => {
    set({
      document: file.document,
      parts: file.parts ?? [],
      consumedParts: file.consumedParts ?? {},
      nextNodeId: file.nextNodeId ?? 1,
      nextPartNum: file.nextPartNum ?? 1,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    });
  },

  addExtrude: (plane, origin, segments, direction) => {
    if (segments.length === 0) return null;

    const state = get();
    let nid = state.nextNodeId;
    const partNum = state.nextPartNum;

    const sketchId = nid++;
    const extrudeId = nid++;
    const scaleId = nid++;
    const rotateId = nid++;
    const translateId = nid++;

    const { x_dir, y_dir } = getSketchPlaneDirections(plane);

    const sketchOp: CsgOp = {
      type: "Sketch2D",
      origin,
      x_dir,
      y_dir,
      segments,
    };

    const extrudeOp: CsgOp = {
      type: "Extrude",
      sketch: sketchId,
      direction,
    };

    const scaleOp: CsgOp = {
      type: "Scale",
      child: extrudeId,
      factor: { x: 1, y: 1, z: 1 },
    };
    const rotateOp: CsgOp = {
      type: "Rotate",
      child: scaleId,
      angles: { x: 0, y: 0, z: 0 },
    };
    const translateOp: CsgOp = {
      type: "Translate",
      child: rotateId,
      offset: { x: 0, y: 0, z: 0 },
    };

    const partId = `part-${partNum}`;
    const name = `Extrude ${partNum}`;

    const undoState = pushUndo(state, "Extrude");
    const newDoc = structuredClone(state.document);

    newDoc.nodes[String(sketchId)] = makeNode(sketchId, null, sketchOp);
    newDoc.nodes[String(extrudeId)] = makeNode(extrudeId, null, extrudeOp);
    newDoc.nodes[String(scaleId)] = makeNode(scaleId, null, scaleOp);
    newDoc.nodes[String(rotateId)] = makeNode(rotateId, null, rotateOp);
    newDoc.nodes[String(translateId)] = makeNode(
      translateId,
      name,
      translateOp,
    );
    newDoc.roots.push({ root: translateId, material: "default" });

    if (!newDoc.materials["default"]) {
      newDoc.materials["default"] = {
        name: "Default",
        color: [0.55, 0.55, 0.55],
        metallic: 0.0,
        roughness: 0.7,
      };
    }

    const partInfo: ExtrudePartInfo = {
      id: partId,
      name,
      kind: "extrude",
      sketchNodeId: sketchId,
      extrudeNodeId: extrudeId,
      scaleNodeId: scaleId,
      rotateNodeId: rotateId,
      translateNodeId: translateId,
    };

    set({
      document: newDoc,
      parts: [...state.parts, partInfo],
      nextNodeId: nid,
      nextPartNum: partNum + 1,
      isDirty: true,
      ...undoState,
    });

    return partId;
  },

  addRevolve: (plane, origin, segments, axisOrigin, axisDir, angleDeg) => {
    if (segments.length === 0) return null;

    const state = get();
    let nid = state.nextNodeId;
    const partNum = state.nextPartNum;

    const sketchId = nid++;
    const revolveId = nid++;
    const scaleId = nid++;
    const rotateId = nid++;
    const translateId = nid++;

    const { x_dir, y_dir } = getSketchPlaneDirections(plane);

    const sketchOp: CsgOp = {
      type: "Sketch2D",
      origin,
      x_dir,
      y_dir,
      segments,
    };

    const revolveOp: CsgOp = {
      type: "Revolve",
      sketch: sketchId,
      axis_origin: axisOrigin,
      axis_dir: axisDir,
      angle_deg: angleDeg,
    };

    const scaleOp: CsgOp = {
      type: "Scale",
      child: revolveId,
      factor: { x: 1, y: 1, z: 1 },
    };
    const rotateOp: CsgOp = {
      type: "Rotate",
      child: scaleId,
      angles: { x: 0, y: 0, z: 0 },
    };
    const translateOp: CsgOp = {
      type: "Translate",
      child: rotateId,
      offset: { x: 0, y: 0, z: 0 },
    };

    const partId = `part-${partNum}`;
    const name = `Revolve ${partNum}`;

    const undoState = pushUndo(state, "Revolve");
    const newDoc = structuredClone(state.document);

    newDoc.nodes[String(sketchId)] = makeNode(sketchId, null, sketchOp);
    newDoc.nodes[String(revolveId)] = makeNode(revolveId, null, revolveOp);
    newDoc.nodes[String(scaleId)] = makeNode(scaleId, null, scaleOp);
    newDoc.nodes[String(rotateId)] = makeNode(rotateId, null, rotateOp);
    newDoc.nodes[String(translateId)] = makeNode(
      translateId,
      name,
      translateOp,
    );
    newDoc.roots.push({ root: translateId, material: "default" });

    if (!newDoc.materials["default"]) {
      newDoc.materials["default"] = {
        name: "Default",
        color: [0.55, 0.55, 0.55],
        metallic: 0.0,
        roughness: 0.7,
      };
    }

    const partInfo: RevolvePartInfo = {
      id: partId,
      name,
      kind: "revolve",
      sketchNodeId: sketchId,
      revolveNodeId: revolveId,
      scaleNodeId: scaleId,
      rotateNodeId: rotateId,
      translateNodeId: translateId,
    };

    set({
      document: newDoc,
      parts: [...state.parts, partInfo],
      nextNodeId: nid,
      nextPartNum: partNum + 1,
      isDirty: true,
      ...undoState,
    });

    return partId;
  },

  addSweep: (plane, origin, segments, path, options = {}) => {
    if (segments.length === 0) return null;

    const state = get();
    let nid = state.nextNodeId;
    const partNum = state.nextPartNum;

    const sketchId = nid++;
    const sweepId = nid++;
    const scaleId = nid++;
    const rotateId = nid++;
    const translateId = nid++;

    const { x_dir, y_dir } = getSketchPlaneDirections(plane);

    const sketchOp: CsgOp = {
      type: "Sketch2D",
      origin,
      x_dir,
      y_dir,
      segments,
    };

    const sweepOp: CsgOp = {
      type: "Sweep",
      sketch: sketchId,
      path,
      twist_angle: options.twist_angle,
      scale_start: options.scale_start,
      scale_end: options.scale_end,
    };

    const scaleOp: CsgOp = {
      type: "Scale",
      child: sweepId,
      factor: { x: 1, y: 1, z: 1 },
    };
    const rotateOp: CsgOp = {
      type: "Rotate",
      child: scaleId,
      angles: { x: 0, y: 0, z: 0 },
    };
    const translateOp: CsgOp = {
      type: "Translate",
      child: rotateId,
      offset: { x: 0, y: 0, z: 0 },
    };

    const partId = `part-${partNum}`;
    const name = `Sweep ${partNum}`;

    const undoState = pushUndo(state, "Sweep");
    const newDoc = structuredClone(state.document);

    newDoc.nodes[String(sketchId)] = makeNode(sketchId, null, sketchOp);
    newDoc.nodes[String(sweepId)] = makeNode(sweepId, null, sweepOp);
    newDoc.nodes[String(scaleId)] = makeNode(scaleId, null, scaleOp);
    newDoc.nodes[String(rotateId)] = makeNode(rotateId, null, rotateOp);
    newDoc.nodes[String(translateId)] = makeNode(
      translateId,
      name,
      translateOp,
    );
    newDoc.roots.push({ root: translateId, material: "default" });

    if (!newDoc.materials["default"]) {
      newDoc.materials["default"] = {
        name: "Default",
        color: [0.55, 0.55, 0.55],
        metallic: 0.0,
        roughness: 0.7,
      };
    }

    const partInfo: SweepPartInfo = {
      id: partId,
      name,
      kind: "sweep",
      sketchNodeId: sketchId,
      sweepNodeId: sweepId,
      scaleNodeId: scaleId,
      rotateNodeId: rotateId,
      translateNodeId: translateId,
    };

    set({
      document: newDoc,
      parts: [...state.parts, partInfo],
      nextNodeId: nid,
      nextPartNum: partNum + 1,
      isDirty: true,
      ...undoState,
    });

    return partId;
  },

  addLoft: (profiles, options = {}) => {
    if (profiles.length < 2) return null;

    const state = get();
    let nid = state.nextNodeId;
    const partNum = state.nextPartNum;

    // Create sketch nodes for each profile
    const sketchIds: number[] = [];
    const sketchOps: CsgOp[] = [];

    for (const profile of profiles) {
      const sketchId = nid++;
      sketchIds.push(sketchId);

      const { x_dir, y_dir } = getSketchPlaneDirections(profile.plane);
      sketchOps.push({
        type: "Sketch2D",
        origin: profile.origin,
        x_dir,
        y_dir,
        segments: profile.segments,
      });
    }

    const loftId = nid++;
    const scaleId = nid++;
    const rotateId = nid++;
    const translateId = nid++;

    const loftOp: CsgOp = {
      type: "Loft",
      sketches: sketchIds,
      closed: options.closed,
    };

    const scaleOp: CsgOp = {
      type: "Scale",
      child: loftId,
      factor: { x: 1, y: 1, z: 1 },
    };
    const rotateOp: CsgOp = {
      type: "Rotate",
      child: scaleId,
      angles: { x: 0, y: 0, z: 0 },
    };
    const translateOp: CsgOp = {
      type: "Translate",
      child: rotateId,
      offset: { x: 0, y: 0, z: 0 },
    };

    const partId = `part-${partNum}`;
    const name = `Loft ${partNum}`;

    const undoState = pushUndo(state, "Loft");
    const newDoc = structuredClone(state.document);

    // Add all sketch nodes
    for (let i = 0; i < sketchIds.length; i++) {
      newDoc.nodes[String(sketchIds[i])] = makeNode(
        sketchIds[i]!,
        null,
        sketchOps[i]!,
      );
    }

    newDoc.nodes[String(loftId)] = makeNode(loftId, null, loftOp);
    newDoc.nodes[String(scaleId)] = makeNode(scaleId, null, scaleOp);
    newDoc.nodes[String(rotateId)] = makeNode(rotateId, null, rotateOp);
    newDoc.nodes[String(translateId)] = makeNode(
      translateId,
      name,
      translateOp,
    );
    newDoc.roots.push({ root: translateId, material: "default" });

    if (!newDoc.materials["default"]) {
      newDoc.materials["default"] = {
        name: "Default",
        color: [0.55, 0.55, 0.55],
        metallic: 0.0,
        roughness: 0.7,
      };
    }

    const partInfo: LoftPartInfo = {
      id: partId,
      name,
      kind: "loft",
      sketchNodeIds: sketchIds,
      loftNodeId: loftId,
      scaleNodeId: scaleId,
      rotateNodeId: rotateId,
      translateNodeId: translateId,
    };

    set({
      document: newDoc,
      parts: [...state.parts, partInfo],
      nextNodeId: nid,
      nextPartNum: partNum + 1,
      isDirty: true,
      ...undoState,
    });

    return partId;
  },

  setPartMaterial: (partId, materialKey) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part) return;

    const undoState = pushUndo(state, "Set Material");
    const newDoc = structuredClone(state.document);

    // Update the root entry's material
    const rootEntry = newDoc.roots.find((r) => r.root === part.translateNodeId);
    if (rootEntry) {
      rootEntry.material = materialKey;
    }

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  renamePart: (partId, name) => {
    const state = get();
    const idx = state.parts.findIndex((p) => p.id === partId);
    if (idx === -1) return;

    const undoState = pushUndo(state, "Rename");
    const newParts = state.parts.map((p) =>
      p.id === partId ? { ...p, name } : p,
    );
    const newDoc = structuredClone(state.document);
    const node = newDoc.nodes[String(state.parts[idx]!.translateNodeId)];
    if (node) node.name = name;

    set({ parts: newParts, document: newDoc, isDirty: true, ...undoState });
  },

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;

    const prevSnap = state.undoStack[state.undoStack.length - 1]!;
    // Create snapshot with the action name we're undoing (for redo stack)
    const currentSnap = snapshot(state, prevSnap.actionName);

    set({
      document: JSON.parse(prevSnap.document) as Document,
      parts: prevSnap.parts,
      consumedParts: prevSnap.consumedParts,
      nextNodeId: prevSnap.nextNodeId,
      nextPartNum: prevSnap.nextPartNum,
      isDirty: true,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, currentSnap],
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;

    const nextSnap = state.redoStack[state.redoStack.length - 1]!;
    // Create snapshot with the action name we're redoing (for undo stack)
    const currentSnap = snapshot(state, nextSnap.actionName);

    set({
      document: JSON.parse(nextSnap.document) as Document,
      parts: nextSnap.parts,
      consumedParts: nextSnap.consumedParts,
      nextNodeId: nextSnap.nextNodeId,
      nextPartNum: nextSnap.nextPartNum,
      isDirty: true,
      undoStack: [...state.undoStack, currentSnap],
      redoStack: state.redoStack.slice(0, -1),
    });
  },

  markSaved: () => {
    set({ isDirty: false });
  },

  // Assembly operations
  setInstanceTransform: (instanceId, transform, skipUndo) => {
    const state = get();
    if (!state.document.instances) return;

    const idx = state.document.instances.findIndex((i) => i.id === instanceId);
    if (idx === -1) return;

    const undoState = skipUndo ? {} : pushUndo(state, "Transform Instance");
    const newDoc = structuredClone(state.document);
    const instance = newDoc.instances![idx]!;
    newDoc.instances![idx] = { ...instance, transform };

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  setInstanceMaterial: (instanceId, materialKey) => {
    const state = get();
    if (!state.document.instances) return;

    const idx = state.document.instances.findIndex((i) => i.id === instanceId);
    if (idx === -1) return;

    const undoState = pushUndo(state, "Set Instance Material");
    const newDoc = structuredClone(state.document);
    const instance = newDoc.instances![idx]!;
    newDoc.instances![idx] = { ...instance, material: materialKey };

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  setJointState: (jointId, newState, skipUndo) => {
    const state = get();
    if (!state.document.joints) return;

    const idx = state.document.joints.findIndex((j) => j.id === jointId);
    if (idx === -1) return;

    const undoState = skipUndo ? {} : pushUndo(state, "Adjust Joint");
    const newDoc = structuredClone(state.document);
    const joint = newDoc.joints![idx]!;
    newDoc.joints![idx] = { ...joint, state: newState };

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  createPartDef: (partId, name) => {
    const state = get();
    const part = state.parts.find((p) => p.id === partId);
    if (!part) return null;

    const undoState = pushUndo(state, "Create Part Definition");
    const newDoc = structuredClone(state.document);

    // Initialize partDefs if needed
    if (!newDoc.partDefs) {
      newDoc.partDefs = {};
    }

    // Generate unique ID
    const existingCount = Object.keys(newDoc.partDefs).length;
    const partDefId = `partdef-${existingCount + 1}`;
    const defName = name ?? `${part.name} Def`;

    // Create part definition pointing to this part's root node
    const partDef: PartDef = {
      id: partDefId,
      name: defName,
      root: part.translateNodeId,
    };

    newDoc.partDefs[partDefId] = partDef;

    // Initialize instances array if needed
    if (!newDoc.instances) {
      newDoc.instances = [];
    }

    // Create first instance of this part definition
    const instanceId = `instance-${newDoc.instances.length + 1}`;
    const instance: Instance = {
      id: instanceId,
      partDefId,
      name: part.name,
      transform: identityTransform(),
    };
    newDoc.instances.push(instance);

    // Remove this part from roots (it's now managed via instances)
    newDoc.roots = newDoc.roots.filter((r) => r.root !== part.translateNodeId);

    // If this is the first instance, make it the ground
    if (newDoc.instances.length === 1) {
      newDoc.groundInstanceId = instanceId;
    }

    // Remove from parts list since it's now a partDef
    const newParts = state.parts.filter((p) => p.id !== partId);

    set({
      document: newDoc,
      parts: newParts,
      isDirty: true,
      ...undoState,
    });

    return partDefId;
  },

  createInstance: (partDefId, name, transform) => {
    const state = get();
    const undoState = pushUndo(state, "Insert Instance");
    const newDoc = structuredClone(state.document);

    if (!newDoc.instances) {
      newDoc.instances = [];
    }

    const partDef = newDoc.partDefs?.[partDefId];
    const instanceNum = newDoc.instances.length + 1;
    const instanceId = `instance-${instanceNum}`;

    // Default transform: offset slightly from origin
    const defaultTransform = transform ?? {
      translation: { x: instanceNum * 30, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };

    const instance: Instance = {
      id: instanceId,
      partDefId,
      name: name ?? partDef?.name ?? `Instance ${instanceNum}`,
      transform: defaultTransform,
    };

    newDoc.instances.push(instance);

    set({ document: newDoc, isDirty: true, ...undoState });
    return instanceId;
  },

  addJoint: (config) => {
    const state = get();
    const undoState = pushUndo(state, "Add Joint");
    const newDoc = structuredClone(state.document);

    if (!newDoc.joints) {
      newDoc.joints = [];
    }

    const jointNum = newDoc.joints.length + 1;
    const jointId = `joint-${jointNum}`;

    const joint: Joint = {
      id: jointId,
      name: config.name,
      parentInstanceId: config.parentInstanceId,
      childInstanceId: config.childInstanceId,
      parentAnchor: config.parentAnchor,
      childAnchor: config.childAnchor,
      kind: config.kind,
      state: 0,
    };

    newDoc.joints.push(joint);

    set({ document: newDoc, isDirty: true, ...undoState });
    return jointId;
  },

  deleteInstance: (instanceId) => {
    const state = get();
    if (!state.document.instances) return;

    const instance = state.document.instances.find((i) => i.id === instanceId);
    if (!instance) return;

    const undoState = pushUndo(state, "Delete Instance");
    const newDoc = structuredClone(state.document);

    // Remove the instance
    newDoc.instances = newDoc.instances!.filter((i) => i.id !== instanceId);

    // Remove any joints that reference this instance
    if (newDoc.joints) {
      newDoc.joints = newDoc.joints.filter(
        (j) =>
          j.parentInstanceId !== instanceId && j.childInstanceId !== instanceId,
      );
    }

    // If this was the ground instance, clear it or assign to another
    if (newDoc.groundInstanceId === instanceId) {
      newDoc.groundInstanceId =
        newDoc.instances.length > 0 ? newDoc.instances[0]!.id : undefined;
    }

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  deleteJoint: (jointId) => {
    const state = get();
    if (!state.document.joints) return;

    const undoState = pushUndo(state, "Delete Joint");
    const newDoc = structuredClone(state.document);

    newDoc.joints = newDoc.joints!.filter((j) => j.id !== jointId);

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  setGroundInstance: (instanceId) => {
    const state = get();
    if (!state.document.instances) return;

    const exists = state.document.instances.some((i) => i.id === instanceId);
    if (!exists) return;

    const undoState = pushUndo(state, "Set Ground");
    const newDoc = structuredClone(state.document);
    newDoc.groundInstanceId = instanceId;

    set({ document: newDoc, isDirty: true, ...undoState });
  },

  renameInstance: (instanceId, name) => {
    const state = get();
    if (!state.document.instances) return;

    const idx = state.document.instances.findIndex((i) => i.id === instanceId);
    if (idx === -1) return;

    const undoState = pushUndo(state, "Rename Instance");
    const newDoc = structuredClone(state.document);
    const instance = newDoc.instances![idx]!;
    newDoc.instances![idx] = { ...instance, name };

    set({ document: newDoc, isDirty: true, ...undoState });
  },
}));
