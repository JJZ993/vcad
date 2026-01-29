import type { VcadFile } from "@vcad/core";

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface ExampleMeta {
  id: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  thumbnail: string;
  features: string[];
  unlockAfter: number;
}

export interface Example extends ExampleMeta {
  file: VcadFile;
}

import { plateExample } from "./plate.vcad";
import { bracketExample } from "./bracket.vcad";
import { mascotExample } from "./mascot.vcad";

export const examples: Example[] = [plateExample, bracketExample, mascotExample];

export function getVisibleExamples(examplesOpened: string[]): Example[] {
  const openedCount = examplesOpened.length;
  return examples.filter((ex) => ex.unlockAfter <= openedCount);
}

export function getLockedCount(examplesOpened: string[]): number {
  const openedCount = examplesOpened.length;
  return examples.filter((ex) => ex.unlockAfter > openedCount).length;
}
