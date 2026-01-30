/**
 * JSON Schema definitions for create_cad_document tool.
 */

/** JSON Schema for input validation. */
export const createCadDocumentSchema = {
  type: "object" as const,
  properties: {
    parts: {
      type: "array" as const,
      description: "Parts to create in the document",
      items: {
        type: "object" as const,
        properties: {
          name: {
            type: "string" as const,
            description: "Name of the part",
          },
          primitive: {
            type: "object" as const,
            description:
              "Base primitive shape. Origins: cube has corner at (0,0,0) extending to (size.x, size.y, size.z); cylinder has base center at (0,0,0) with height along +Z; sphere has center at (0,0,0); cone has base center at (0,0,0) with height along +Z.",
            properties: {
              type: {
                type: "string" as const,
                enum: ["cube", "cylinder", "sphere", "cone"],
                description:
                  "Primitive type. Cube: corner at origin. Cylinder: base center at origin, +Z up. Sphere: center at origin. Cone: base center at origin, +Z up.",
              },
              size: {
                type: "object" as const,
                description:
                  "Size for cube (x, y, z dimensions in mm). Cube extends from (0,0,0) to (size.x, size.y, size.z).",
                properties: {
                  x: { type: "number" as const },
                  y: { type: "number" as const },
                  z: { type: "number" as const },
                },
              },
              radius: {
                type: "number" as const,
                description: "Radius for cylinder/sphere (mm)",
              },
              height: {
                type: "number" as const,
                description: "Height for cylinder/cone (mm), extends along +Z axis",
              },
              segments: {
                type: "number" as const,
                description: "Number of segments for curved surfaces (default: 32)",
              },
              radius_bottom: {
                type: "number" as const,
                description: "Bottom radius for cone (mm)",
              },
              radius_top: {
                type: "number" as const,
                description: "Top radius for cone (mm, 0 for pointed cone)",
              },
            },
            required: ["type"],
          },
          operations: {
            type: "array" as const,
            description: "Operations to apply (in order)",
            items: {
              type: "object" as const,
              properties: {
                type: {
                  type: "string" as const,
                  enum: [
                    "union",
                    "difference",
                    "intersection",
                    "translate",
                    "rotate",
                    "scale",
                    "linear_pattern",
                    "circular_pattern",
                    "hole",
                  ],
                  description:
                    "Operation type. 'hole' creates a vertical through-hole (cylinder difference along Z axis).",
                },
                primitive: {
                  type: "object" as const,
                  description: "Primitive for boolean operations",
                },
                at: {
                  oneOf: [
                    {
                      type: "object" as const,
                      description: "Absolute position {x, y, z} in mm",
                      properties: {
                        x: { type: "number" as const },
                        y: { type: "number" as const },
                        z: { type: "number" as const },
                      },
                    },
                    {
                      type: "string" as const,
                      enum: ["center", "top-center", "bottom-center"],
                      description: "Named position relative to base primitive",
                    },
                    {
                      type: "object" as const,
                      description:
                        "Percentage position {x: '50%', y: '50%'} relative to base primitive bounds",
                      properties: {
                        x: { oneOf: [{ type: "number" as const }, { type: "string" as const }] },
                        y: { oneOf: [{ type: "number" as const }, { type: "string" as const }] },
                        z: { oneOf: [{ type: "number" as const }, { type: "string" as const }] },
                      },
                    },
                    {
                      type: "object" as const,
                      description:
                        "Position relative to another part. Places this primitive adjacent to the specified face of the target part.",
                      properties: {
                        relativeTo: {
                          type: "string" as const,
                          description: "Name of the target part to position relative to",
                        },
                        face: {
                          type: "string" as const,
                          enum: ["top", "bottom", "left", "right", "front", "back"],
                          description: "Which face of the target part to align to",
                        },
                        align: {
                          type: "string" as const,
                          enum: ["center", "min", "max"],
                          description: "Alignment on the face plane (default: 'center')",
                        },
                        offset: {
                          type: "object" as const,
                          description: "Optional offset from computed position",
                          properties: {
                            x: { type: "number" as const },
                            y: { type: "number" as const },
                            z: { type: "number" as const },
                          },
                        },
                      },
                      required: ["relativeTo", "face"],
                    },
                  ],
                  description:
                    "Position for operation. Accepts: absolute {x,y,z}, named ('center', 'top-center', 'bottom-center'), percentage ({x:'50%', y:'50%'}), or relative ({relativeTo: 'partName', face: 'top'}).",
                },
                diameter: {
                  type: "number" as const,
                  description: "Diameter for hole operation (mm)",
                },
                depth: {
                  type: "number" as const,
                  description:
                    "Depth for hole operation (mm). Omit for through-hole (auto-sized to pass through part).",
                },
                offset: {
                  type: "object" as const,
                  description: "Translation offset (mm)",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                angles: {
                  type: "object" as const,
                  description: "Rotation angles (degrees)",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                factor: {
                  type: "object" as const,
                  description: "Scale factors",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                direction: {
                  type: "object" as const,
                  description: "Direction for linear pattern",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                count: {
                  type: "number" as const,
                  description: "Number of copies for patterns",
                },
                spacing: {
                  type: "number" as const,
                  description: "Spacing for linear pattern (mm)",
                },
                axis_origin: {
                  type: "object" as const,
                  description: "Axis origin for circular pattern",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                axis_dir: {
                  type: "object" as const,
                  description: "Axis direction for circular pattern",
                  properties: {
                    x: { type: "number" as const },
                    y: { type: "number" as const },
                    z: { type: "number" as const },
                  },
                },
                angle_deg: {
                  type: "number" as const,
                  description: "Total angle for circular pattern (degrees)",
                },
              },
              required: ["type"],
            },
          },
          material: {
            type: "string" as const,
            description: "Material key (e.g., 'aluminum', 'steel')",
          },
        },
        required: ["name", "primitive"],
      },
    },
  },
  required: ["parts"],
};
