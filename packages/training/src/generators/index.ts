/**
 * Generator registry - exports all part generators.
 */

export type {
  PartParams,
  ParamValue,
  ParamDef,
  ParamRange,
  GeneratedPart,
  PartGenerator,
  TrainingExample,
  ValidationResult,
} from "./types.js";

// Original generators (C, Y, T, R, U, D operations)
export { PlateGenerator, type PlateParams, type HolePattern } from "./plate.js";
export { SpacerGenerator, type SpacerParams, type SpacerType } from "./spacer.js";
export { BracketGenerator, type BracketParams, type BracketType } from "./bracket.js";
export { FlangeGenerator, type FlangeParams, type FlangeType } from "./flange.js";
export { ShaftGenerator, type ShaftParams, type ShaftType } from "./shaft.js";
export { EnclosureGenerator, type EnclosureParams, type EnclosureType } from "./enclosure.js";
export { MountGenerator, type MountParams, type MountType } from "./mount.js";

// New generators for expanded IR coverage
export { BallGenerator, type BallParams, type BallType } from "./ball.js";           // S (Sphere)
export { FunnelGenerator, type FunnelParams, type FunnelType } from "./funnel.js";   // K (Cone)
export { ClipGenerator, type ClipParams, type ClipType } from "./clip.js";           // I (Intersection)
export { ScaledGenerator, type ScaledParams, type ScaledType } from "./scaled.js";   // X (Scale)
export { ArrayGenerator, type ArrayParams, type ArrayType } from "./array.js";       // LP (LinearPattern)
export { RadialGenerator, type RadialParams, type RadialType } from "./radial.js";   // CP (CircularPattern)
export { HollowGenerator, type HollowParams, type HollowType } from "./hollow.js";   // SH (Shell)
export { ProfileGenerator, type ProfileParams, type ProfileType } from "./profile.js"; // SK + E (Sketch + Extrude)
export { TurnedGenerator, type TurnedParams, type TurnedType } from "./turned.js";   // SK + V (Sketch + Revolve)

export {
  randInt,
  randFloat,
  randChoice,
  randBool,
  fmt,
  cornerHoles,
  edgeHoles,
  gridHoles,
  circularHoles,
  centerHole,
} from "./utils.js";

import type { PartGenerator } from "./types.js";
import { PlateGenerator } from "./plate.js";
import { SpacerGenerator } from "./spacer.js";
import { BracketGenerator } from "./bracket.js";
import { FlangeGenerator } from "./flange.js";
import { ShaftGenerator } from "./shaft.js";
import { EnclosureGenerator } from "./enclosure.js";
import { MountGenerator } from "./mount.js";
import { BallGenerator } from "./ball.js";
import { FunnelGenerator } from "./funnel.js";
import { ClipGenerator } from "./clip.js";
import { ScaledGenerator } from "./scaled.js";
import { ArrayGenerator } from "./array.js";
import { RadialGenerator } from "./radial.js";
import { HollowGenerator } from "./hollow.js";
import { ProfileGenerator } from "./profile.js";
import { TurnedGenerator } from "./turned.js";

/** All available generators by family name. */
export const generators: Record<string, PartGenerator> = {
  // Original families
  plate: new PlateGenerator(),
  spacer: new SpacerGenerator(),
  bracket: new BracketGenerator(),
  flange: new FlangeGenerator(),
  shaft: new ShaftGenerator(),
  enclosure: new EnclosureGenerator(),
  mount: new MountGenerator(),
  // New families for expanded IR coverage
  ball: new BallGenerator(),
  funnel: new FunnelGenerator(),
  clip: new ClipGenerator(),
  scaled: new ScaledGenerator(),
  array: new ArrayGenerator(),
  radial: new RadialGenerator(),
  hollow: new HollowGenerator(),
  profile: new ProfileGenerator(),
  turned: new TurnedGenerator(),
};

/** List of all generator family names. */
export const generatorFamilies = Object.keys(generators);

/** Get a generator by family name. */
export function getGenerator(family: string): PartGenerator | undefined {
  return generators[family];
}

/** Generate a random part from a random family. */
export function generateRandomPart(): ReturnType<PartGenerator["generate"]> {
  const families = Object.keys(generators);
  const family = families[Math.floor(Math.random() * families.length)];
  return generators[family].generate();
}

/** Default counts per family for the full dataset. */
export const defaultCounts: Record<string, number> = {
  // Original families
  plate: 15000,
  bracket: 10000,
  flange: 8000,
  spacer: 5000,
  shaft: 5000,
  enclosure: 5000,
  mount: 2000,
  // New families (10k each as specified in plan)
  ball: 10000,
  funnel: 10000,
  clip: 10000,
  scaled: 10000,
  array: 10000,
  radial: 10000,
  hollow: 10000,
  profile: 10000,
  turned: 10000,
};
