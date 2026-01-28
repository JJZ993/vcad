import type { Document } from "@vcad/ir";
import type { PartInfo } from "@/types";
import { downloadBlob } from "./download";

export interface VcadFile {
  version: string;
  document: Document;
  parts: PartInfo[];
  nextNodeId: number;
  nextPartNum: number;
}

export function saveDocument(state: {
  document: Document;
  parts: PartInfo[];
  nextNodeId: number;
  nextPartNum: number;
}) {
  const file: VcadFile = {
    version: "0.1",
    document: state.document,
    parts: state.parts,
    nextNodeId: state.nextNodeId,
    nextPartNum: state.nextPartNum,
  };

  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, "model.vcad");
}

export function parseVcadFile(json: string): VcadFile {
  const data = JSON.parse(json) as VcadFile;

  // Basic validation
  if (!data.document || !Array.isArray(data.parts)) {
    throw new Error("Invalid .vcad file: missing document or parts");
  }
  if (typeof data.nextNodeId !== "number" || typeof data.nextPartNum !== "number") {
    throw new Error("Invalid .vcad file: missing nextNodeId or nextPartNum");
  }

  return data;
}
