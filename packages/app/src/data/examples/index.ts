import type { VcadFile } from "@vcad/core";

export interface Example {
  id: string;
  name: string;
  file: VcadFile;
}

import { plateExample } from "./plate.vcad";
import { bracketExample } from "./bracket.vcad";
import { mascotExample } from "./mascot.vcad";

export const examples: Example[] = [plateExample, bracketExample, mascotExample];
