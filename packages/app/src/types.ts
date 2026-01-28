import type { NodeId } from "@vcad/ir";

export type PrimitiveKind = "cube" | "cylinder" | "sphere";
export type BooleanType = "union" | "difference" | "intersection";

export interface PrimitivePartInfo {
  id: string;
  name: string;
  kind: PrimitiveKind;
  primitiveNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
}

export interface BooleanPartInfo {
  id: string;
  name: string;
  kind: "boolean";
  booleanType: BooleanType;
  booleanNodeId: NodeId;
  scaleNodeId: NodeId;
  rotateNodeId: NodeId;
  translateNodeId: NodeId;
  sourcePartIds: [string, string];
}

export type PartInfo = PrimitivePartInfo | BooleanPartInfo;

export function isPrimitivePart(part: PartInfo): part is PrimitivePartInfo {
  return part.kind !== "boolean";
}

export function isBooleanPart(part: PartInfo): part is BooleanPartInfo {
  return part.kind === "boolean";
}

export type ToolMode = "select" | "primitive";
export type TransformMode = "translate" | "rotate" | "scale";
export type Theme = "dark" | "light";
