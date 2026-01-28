//! Surface entities: planes, cylinders, cones, spheres.

use crate::error::StepError;
use crate::parser::StepFile;
use super::{EntityArgs, parse_any_axis_placement, AxisPlacement};
use vcad_kernel_geom::{ConeSurface, CylinderSurface, Plane, SphereSurface, Surface};

/// A surface parsed from STEP.
#[derive(Debug, Clone)]
pub enum StepSurface {
    /// A planar surface.
    Plane(Plane),
    /// A cylindrical surface.
    Cylinder(CylinderSurface),
    /// A conical surface.
    Cone(ConeSurface),
    /// A spherical surface.
    Sphere(SphereSurface),
    // Future: ToroidalSurface, BSplineSurface, etc.
}

impl StepSurface {
    /// Convert to a boxed Surface trait object.
    pub fn into_box(self) -> Box<dyn Surface> {
        match self {
            StepSurface::Plane(p) => Box::new(p),
            StepSurface::Cylinder(c) => Box::new(c),
            StepSurface::Cone(c) => Box::new(c),
            StepSurface::Sphere(s) => Box::new(s),
        }
    }
}

/// Parse a PLANE entity.
///
/// STEP syntax: `PLANE(name, position)`
pub fn parse_plane(file: &StepFile, id: u64) -> Result<Plane, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "PLANE" => {
            let placement_id = entity.entity_ref(1)?;
            let placement = parse_any_axis_placement(file, placement_id)?;

            Ok(Plane::new(
                placement.location,
                *placement.x_axis().as_ref(),
                *placement.y_axis().as_ref(),
            ))
        }
        other => Err(StepError::type_mismatch("PLANE", other)),
    }
}

/// Parse a CYLINDRICAL_SURFACE entity.
///
/// STEP syntax: `CYLINDRICAL_SURFACE(name, position, radius)`
pub fn parse_cylindrical_surface(file: &StepFile, id: u64) -> Result<CylinderSurface, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "CYLINDRICAL_SURFACE" => {
            let placement_id = entity.entity_ref(1)?;
            let radius = entity.real(2)?;

            let placement = parse_any_axis_placement(file, placement_id)?;

            Ok(CylinderSurface {
                center: placement.location,
                axis: placement.z_axis(),
                ref_dir: placement.x_axis(),
                radius,
            })
        }
        other => Err(StepError::type_mismatch("CYLINDRICAL_SURFACE", other)),
    }
}

/// Parse a CONICAL_SURFACE entity.
///
/// STEP syntax: `CONICAL_SURFACE(name, position, radius, semi_angle)`
pub fn parse_conical_surface(file: &StepFile, id: u64) -> Result<ConeSurface, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "CONICAL_SURFACE" => {
            let placement_id = entity.entity_ref(1)?;
            let radius = entity.real(2)?;
            let semi_angle = entity.real(3)?; // In radians

            let placement = parse_any_axis_placement(file, placement_id)?;

            // STEP conical surface is defined with apex at position + radius along axis
            // Our ConeSurface needs the apex location
            // The apex is along the negative axis direction from the position
            let apex_dist = if semi_angle.tan().abs() > 1e-15 {
                radius / semi_angle.tan()
            } else {
                0.0
            };
            let apex = placement.location - apex_dist * placement.z_axis().as_ref();

            Ok(ConeSurface {
                apex,
                axis: placement.z_axis(),
                ref_dir: placement.x_axis(),
                half_angle: semi_angle,
            })
        }
        other => Err(StepError::type_mismatch("CONICAL_SURFACE", other)),
    }
}

/// Parse a SPHERICAL_SURFACE entity.
///
/// STEP syntax: `SPHERICAL_SURFACE(name, position, radius)`
pub fn parse_spherical_surface(file: &StepFile, id: u64) -> Result<SphereSurface, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "SPHERICAL_SURFACE" => {
            let placement_id = entity.entity_ref(1)?;
            let radius = entity.real(2)?;

            let placement = parse_any_axis_placement(file, placement_id)?;

            Ok(SphereSurface {
                center: placement.location,
                radius,
                ref_dir: placement.x_axis(),
                axis: placement.z_axis(),
            })
        }
        other => Err(StepError::type_mismatch("SPHERICAL_SURFACE", other)),
    }
}

/// Parse any supported surface entity.
pub fn parse_surface(file: &StepFile, id: u64) -> Result<StepSurface, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "PLANE" => Ok(StepSurface::Plane(parse_plane(file, id)?)),
        "CYLINDRICAL_SURFACE" => Ok(StepSurface::Cylinder(parse_cylindrical_surface(file, id)?)),
        "CONICAL_SURFACE" => Ok(StepSurface::Cone(parse_conical_surface(file, id)?)),
        "SPHERICAL_SURFACE" => Ok(StepSurface::Sphere(parse_spherical_surface(file, id)?)),
        other => Err(StepError::UnsupportedEntity(other.to_string())),
    }
}

/// Create an AxisPlacement from a Plane for writing.
pub fn plane_to_placement(plane: &Plane) -> AxisPlacement {
    AxisPlacement {
        location: plane.origin,
        axis: Some(plane.normal_dir),
        ref_direction: Some(plane.x_dir),
    }
}

/// Create an AxisPlacement from a CylinderSurface for writing.
pub fn cylinder_to_placement(cyl: &CylinderSurface) -> AxisPlacement {
    AxisPlacement {
        location: cyl.center,
        axis: Some(cyl.axis),
        ref_direction: Some(cyl.ref_dir),
    }
}

/// Create an AxisPlacement from a SphereSurface for writing.
pub fn sphere_to_placement(sphere: &SphereSurface) -> AxisPlacement {
    AxisPlacement {
        location: sphere.center,
        axis: Some(sphere.axis),
        ref_direction: Some(sphere.ref_dir),
    }
}

/// Write a PLANE to STEP format.
pub fn write_plane(name: &str, placement_id: u64) -> String {
    format!("PLANE('{}', #{})", name, placement_id)
}

/// Write a CYLINDRICAL_SURFACE to STEP format.
pub fn write_cylindrical_surface(radius: f64, name: &str, placement_id: u64) -> String {
    format!(
        "CYLINDRICAL_SURFACE('{}', #{}, {:.15E})",
        name, placement_id, radius
    )
}

/// Write a CONICAL_SURFACE to STEP format.
pub fn write_conical_surface(radius: f64, semi_angle: f64, name: &str, placement_id: u64) -> String {
    format!(
        "CONICAL_SURFACE('{}', #{}, {:.15E}, {:.15E})",
        name, placement_id, radius, semi_angle
    )
}

/// Write a SPHERICAL_SURFACE to STEP format.
pub fn write_spherical_surface(radius: f64, name: &str, placement_id: u64) -> String {
    format!(
        "SPHERICAL_SURFACE('{}', #{}, {:.15E})",
        name, placement_id, radius
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Parser;

    fn parse_step(input: &str) -> StepFile {
        Parser::parse(input.as_bytes()).unwrap()
    }

    #[test]
    fn test_parse_plane() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0.0, 0.0, 5.0));
#2 = DIRECTION('', (0.0, 0.0, 1.0));
#3 = DIRECTION('', (1.0, 0.0, 0.0));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
#5 = PLANE('', #4);
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let plane = parse_plane(&file, 5).unwrap();
        assert!((plane.origin.z - 5.0).abs() < 1e-10);
        assert!((plane.normal_dir.as_ref().z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_parse_cylindrical_surface() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0.0, 0.0, 0.0));
#2 = DIRECTION('', (0.0, 0.0, 1.0));
#3 = DIRECTION('', (1.0, 0.0, 0.0));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
#5 = CYLINDRICAL_SURFACE('', #4, 10.0);
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let cyl = parse_cylindrical_surface(&file, 5).unwrap();
        assert!((cyl.radius - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_parse_spherical_surface() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (1.0, 2.0, 3.0));
#2 = DIRECTION('', (0.0, 0.0, 1.0));
#3 = DIRECTION('', (1.0, 0.0, 0.0));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
#5 = SPHERICAL_SURFACE('', #4, 7.5);
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let sphere = parse_spherical_surface(&file, 5).unwrap();
        assert!((sphere.radius - 7.5).abs() < 1e-10);
        assert!((sphere.center.x - 1.0).abs() < 1e-10);
    }
}
