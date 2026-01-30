/**
 * Type definitions for create_cad_document tool.
 */

import type { Vec3 } from "@vcad/ir";

/** Primitive definition for tool input. */
export interface Primitive {
  type: "cube" | "cylinder" | "sphere" | "cone";
  // Cube
  size?: Vec3;
  // Cylinder/Sphere/Cone
  radius?: number;
  height?: number;
  segments?: number;
  // Cone
  radius_bottom?: number;
  radius_top?: number;
}

/** Named position for relative positioning. */
export type NamedPosition = "center" | "top-center" | "bottom-center";

/** Coordinate value: absolute number or percentage string. */
export type CoordinateValue = number | string;

/** Face name for relative positioning. */
export type FaceName = "top" | "bottom" | "left" | "right" | "front" | "back";

/** Alignment option for relative positioning. */
export type AlignOption = "center" | "min" | "max";

/** Part-relative positioning specification. */
export interface RelativePosition {
  relativeTo: string;  // Name of the target part
  face: FaceName;      // Which face to align to
  align?: AlignOption; // Alignment on the face plane (default: "center")
  offset?: Partial<Vec3>; // Optional offset from computed position
}

/** Position specification: absolute Vec3, named position, percentage-based, or relative. */
export type PositionSpec =
  | Vec3
  | NamedPosition
  | { x: CoordinateValue; y: CoordinateValue; z?: CoordinateValue }
  | RelativePosition;

/** Bounding box representation. */
export interface BBox {
  min: Vec3;
  max: Vec3;
}

/** Operation to apply to geometry. */
export interface Operation {
  type:
    | "union"
    | "difference"
    | "intersection"
    | "translate"
    | "rotate"
    | "scale"
    | "linear_pattern"
    | "circular_pattern"
    | "hole";
  // For boolean ops
  primitive?: Primitive;
  at?: PositionSpec;
  // For hole
  diameter?: number;
  depth?: number;
  // For translate
  offset?: Vec3;
  // For rotate (degrees)
  angles?: Vec3;
  // For scale
  factor?: Vec3;
  // For linear_pattern
  direction?: Vec3;
  count?: number;
  spacing?: number;
  // For circular_pattern
  axis_origin?: Vec3;
  axis_dir?: Vec3;
  angle_deg?: number;
}

/** Part definition for tool input. */
export interface PartInput {
  name: string;
  primitive: Primitive;
  operations?: Operation[];
  material?: string;
}

/** Input schema for create_cad_document. */
export interface CreateInput {
  parts: PartInput[];
}
