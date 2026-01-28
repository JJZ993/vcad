//! Fundamental geometry entities: points, directions, and placements.

use crate::error::StepError;
use crate::parser::StepFile;
use super::EntityArgs;
use vcad_kernel_math::{Dir3, Point3, Vec3};

/// Parse a CARTESIAN_POINT entity.
///
/// STEP syntax: `CARTESIAN_POINT(name, (x, y, z))`
pub fn parse_cartesian_point(file: &StepFile, id: u64) -> Result<Point3, StepError> {
    let entity = file.require(id)?;

    // Handle both CARTESIAN_POINT and complex entity forms
    match entity.type_name.as_str() {
        "CARTESIAN_POINT" => {
            let coords = entity.real_list(1)?;
            if coords.len() < 3 {
                return Err(StepError::parser(
                    Some(id),
                    format!("CARTESIAN_POINT needs 3 coordinates, got {}", coords.len()),
                ));
            }
            Ok(Point3::new(coords[0], coords[1], coords[2]))
        }
        other => Err(StepError::type_mismatch("CARTESIAN_POINT", other)),
    }
}

/// Parse a DIRECTION entity.
///
/// STEP syntax: `DIRECTION(name, (x, y, z))`
pub fn parse_direction(file: &StepFile, id: u64) -> Result<Dir3, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "DIRECTION" => {
            let coords = entity.real_list(1)?;
            if coords.len() < 3 {
                return Err(StepError::parser(
                    Some(id),
                    format!("DIRECTION needs 3 components, got {}", coords.len()),
                ));
            }
            let v = Vec3::new(coords[0], coords[1], coords[2]);
            if v.norm() < 1e-15 {
                return Err(StepError::InvalidGeometry("zero-length direction".into()));
            }
            Ok(Dir3::new_normalize(v))
        }
        other => Err(StepError::type_mismatch("DIRECTION", other)),
    }
}

/// Parse a VECTOR entity (reserved for LINE parsing with curved edges).
///
/// STEP syntax: `VECTOR(name, direction, magnitude)`
#[allow(dead_code)]
pub fn parse_vector(file: &StepFile, id: u64) -> Result<Vec3, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "VECTOR" => {
            let dir_id = entity.entity_ref(1)?;
            let magnitude = entity.real(2)?;
            let dir = parse_direction(file, dir_id)?;
            Ok(magnitude * dir.as_ref())
        }
        other => Err(StepError::type_mismatch("VECTOR", other)),
    }
}

/// Axis placement data (origin + optional directions).
#[derive(Debug, Clone)]
pub struct AxisPlacement {
    /// Location point.
    pub location: Point3,
    /// Z-axis direction (normal).
    pub axis: Option<Dir3>,
    /// X-axis direction (reference).
    pub ref_direction: Option<Dir3>,
}

impl AxisPlacement {
    /// Get the Z-axis direction, defaulting to +Z if not specified.
    pub fn z_axis(&self) -> Dir3 {
        self.axis.unwrap_or_else(|| Dir3::new_normalize(Vec3::z()))
    }

    /// Get the X-axis direction, computing from Z if not specified.
    pub fn x_axis(&self) -> Dir3 {
        match self.ref_direction {
            Some(x) => x,
            None => {
                let z = self.z_axis();
                // Pick an arbitrary perpendicular direction
                let arbitrary = if z.as_ref().x.abs() < 0.9 {
                    Vec3::x()
                } else {
                    Vec3::y()
                };
                Dir3::new_normalize(arbitrary - arbitrary.dot(z.as_ref()) * z.as_ref())
            }
        }
    }

    /// Get the Y-axis direction (computed as Z × X).
    pub fn y_axis(&self) -> Dir3 {
        let z = self.z_axis();
        let x = self.x_axis();
        Dir3::new_normalize(z.as_ref().cross(x.as_ref()))
    }
}

/// Parse an AXIS1_PLACEMENT entity (point + single direction).
///
/// STEP syntax: `AXIS1_PLACEMENT(name, location, axis)`
pub fn parse_axis1_placement(file: &StepFile, id: u64) -> Result<AxisPlacement, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "AXIS1_PLACEMENT" => {
            let loc_id = entity.entity_ref(1)?;
            let location = parse_cartesian_point(file, loc_id)?;

            let axis = if !entity.is_null(2) {
                let axis_id = entity.entity_ref(2)?;
                Some(parse_direction(file, axis_id)?)
            } else {
                None
            };

            Ok(AxisPlacement {
                location,
                axis,
                ref_direction: None,
            })
        }
        other => Err(StepError::type_mismatch("AXIS1_PLACEMENT", other)),
    }
}

/// Parse an AXIS2_PLACEMENT_3D entity (point + two directions).
///
/// STEP syntax: `AXIS2_PLACEMENT_3D(name, location, axis, ref_direction)`
pub fn parse_axis2_placement_3d(file: &StepFile, id: u64) -> Result<AxisPlacement, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "AXIS2_PLACEMENT_3D" => {
            let loc_id = entity.entity_ref(1)?;
            let location = parse_cartesian_point(file, loc_id)?;

            let axis = if !entity.is_null(2) {
                let axis_id = entity.entity_ref(2)?;
                Some(parse_direction(file, axis_id)?)
            } else {
                None
            };

            let ref_direction = if !entity.is_null(3) {
                let ref_id = entity.entity_ref(3)?;
                Some(parse_direction(file, ref_id)?)
            } else {
                None
            };

            Ok(AxisPlacement {
                location,
                axis,
                ref_direction,
            })
        }
        other => Err(StepError::type_mismatch("AXIS2_PLACEMENT_3D", other)),
    }
}

/// Parse any axis placement (AXIS1_PLACEMENT or AXIS2_PLACEMENT_3D).
pub fn parse_any_axis_placement(file: &StepFile, id: u64) -> Result<AxisPlacement, StepError> {
    let entity = file.require(id)?;
    match entity.type_name.as_str() {
        "AXIS1_PLACEMENT" => parse_axis1_placement(file, id),
        "AXIS2_PLACEMENT_3D" => parse_axis2_placement_3d(file, id),
        other => Err(StepError::type_mismatch("AXIS_PLACEMENT", other)),
    }
}

/// Write a CARTESIAN_POINT to STEP format, returning the entity string (without ID).
pub fn write_cartesian_point(p: &Point3, name: &str) -> String {
    format!(
        "CARTESIAN_POINT('{}', ({:.15E}, {:.15E}, {:.15E}))",
        name, p.x, p.y, p.z
    )
}

/// Write a DIRECTION to STEP format.
pub fn write_direction(d: &Dir3, name: &str) -> String {
    let v = d.as_ref();
    format!(
        "DIRECTION('{}', ({:.15E}, {:.15E}, {:.15E}))",
        name, v.x, v.y, v.z
    )
}

/// Write an AXIS2_PLACEMENT_3D to STEP format.
/// Returns the entity string and the IDs of location, axis, and ref_direction entities
/// that need to be written separately.
pub fn write_axis2_placement_3d(
    _placement: &AxisPlacement,
    name: &str,
    loc_id: u64,
    axis_id: Option<u64>,
    ref_id: Option<u64>,
) -> String {
    let axis_ref = axis_id.map(|id| format!("#{id}")).unwrap_or_else(|| "$".into());
    let ref_ref = ref_id.map(|id| format!("#{id}")).unwrap_or_else(|| "$".into());
    format!(
        "AXIS2_PLACEMENT_3D('{}', #{}, {}, {})",
        name, loc_id, axis_ref, ref_ref
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
    fn test_parse_cartesian_point() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('origin', (1.0, 2.0, 3.0));
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let p = parse_cartesian_point(&file, 1).unwrap();
        assert!((p.x - 1.0).abs() < 1e-10);
        assert!((p.y - 2.0).abs() < 1e-10);
        assert!((p.z - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_parse_direction() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = DIRECTION('z', (0.0, 0.0, 1.0));
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let d = parse_direction(&file, 1).unwrap();
        assert!((d.as_ref().z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_parse_axis2_placement_3d() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0.0, 0.0, 0.0));
#2 = DIRECTION('', (0.0, 0.0, 1.0));
#3 = DIRECTION('', (1.0, 0.0, 0.0));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let placement = parse_axis2_placement_3d(&file, 4).unwrap();
        assert!(placement.location.x.abs() < 1e-10);
        assert!((placement.z_axis().as_ref().z - 1.0).abs() < 1e-10);
        assert!((placement.x_axis().as_ref().x - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_write_cartesian_point() {
        let p = Point3::new(1.0, 2.0, 3.0);
        let s = write_cartesian_point(&p, "test");
        assert!(s.contains("CARTESIAN_POINT"));
        assert!(s.contains("'test'"));
    }
}
