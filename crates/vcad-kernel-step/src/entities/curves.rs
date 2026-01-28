//! Curve entities: lines, circles, and B-spline curves.
//!
//! These parsers and writers are reserved for future edge curve support.

#![allow(dead_code)]

use crate::error::StepError;
use crate::parser::StepFile;
use super::{EntityArgs, parse_any_axis_placement, parse_cartesian_point, parse_vector};
use vcad_kernel_geom::{Circle3d, Line3d};
use vcad_kernel_math::{Dir3, Vec3};

/// A curve parsed from STEP.
#[derive(Debug, Clone)]
pub enum StepCurve {
    /// A line defined by a point and direction vector.
    Line(Line3d),
    /// A circle defined by center, radius, and orientation.
    Circle(Circle3d),
    // Future: BSplineCurve, Ellipse, etc.
}

/// Parse a LINE entity.
///
/// STEP syntax: `LINE(name, point, vector)`
pub fn parse_line(file: &StepFile, id: u64) -> Result<Line3d, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "LINE" => {
            let point_id = entity.entity_ref(1)?;
            let vec_id = entity.entity_ref(2)?;

            let origin = parse_cartesian_point(file, point_id)?;
            let direction = parse_vector(file, vec_id)?;

            Ok(Line3d { origin, direction })
        }
        other => Err(StepError::type_mismatch("LINE", other)),
    }
}

/// Parse a CIRCLE entity.
///
/// STEP syntax: `CIRCLE(name, position, radius)`
pub fn parse_circle(file: &StepFile, id: u64) -> Result<Circle3d, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "CIRCLE" => {
            let placement_id = entity.entity_ref(1)?;
            let radius = entity.real(2)?;

            let placement = parse_any_axis_placement(file, placement_id)?;

            Ok(Circle3d {
                center: placement.location,
                radius,
                x_dir: placement.x_axis(),
                y_dir: placement.y_axis(),
                normal: placement.z_axis(),
            })
        }
        other => Err(StepError::type_mismatch("CIRCLE", other)),
    }
}

/// Parse any supported curve entity.
pub fn parse_curve(file: &StepFile, id: u64) -> Result<StepCurve, StepError> {
    let entity = file.require(id)?;

    match entity.type_name.as_str() {
        "LINE" => Ok(StepCurve::Line(parse_line(file, id)?)),
        "CIRCLE" => Ok(StepCurve::Circle(parse_circle(file, id)?)),
        other => Err(StepError::UnsupportedEntity(other.to_string())),
    }
}

/// Write a LINE to STEP format.
/// Returns (line_entity_string, point_id, vector_id, direction_id).
pub fn write_line(
    line: &Line3d,
    name: &str,
    point_id: u64,
    vec_id: u64,
    dir_id: u64,
) -> (String, String, String) {
    let magnitude = line.direction.norm();
    let dir = if magnitude > 1e-15 {
        Dir3::new_normalize(line.direction)
    } else {
        Dir3::new_normalize(Vec3::x())
    };

    let point_str = format!(
        "CARTESIAN_POINT('', ({:.15E}, {:.15E}, {:.15E}))",
        line.origin.x, line.origin.y, line.origin.z
    );
    let dir_str = format!(
        "DIRECTION('', ({:.15E}, {:.15E}, {:.15E}))",
        dir.as_ref().x,
        dir.as_ref().y,
        dir.as_ref().z
    );
    let vec_str = format!("VECTOR('', #{}, {:.15E})", dir_id, magnitude);
    let line_str = format!("LINE('{}', #{}, #{})", name, point_id, vec_id);

    (line_str, point_str, format!("{}\n#{} = {}", dir_str, vec_id, vec_str))
}

/// Write a CIRCLE to STEP format.
pub fn write_circle(
    circle: &Circle3d,
    name: &str,
    placement_id: u64,
) -> String {
    format!("CIRCLE('{}', #{}, {:.15E})", name, placement_id, circle.radius)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Parser;

    fn parse_step(input: &str) -> StepFile {
        Parser::parse(input.as_bytes()).unwrap()
    }

    #[test]
    fn test_parse_line() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0.0, 0.0, 0.0));
#2 = DIRECTION('', (1.0, 0.0, 0.0));
#3 = VECTOR('', #2, 10.0);
#4 = LINE('', #1, #3);
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let line = parse_line(&file, 4).unwrap();
        assert!(line.origin.x.abs() < 1e-10);
        assert!((line.direction.x - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_parse_circle() {
        let input = r#"
ISO-10303-21;
HEADER;
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0.0, 0.0, 0.0));
#2 = DIRECTION('', (0.0, 0.0, 1.0));
#3 = DIRECTION('', (1.0, 0.0, 0.0));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
#5 = CIRCLE('', #4, 5.0);
ENDSEC;
END-ISO-10303-21;
"#;
        let file = parse_step(input);
        let circle = parse_circle(&file, 5).unwrap();
        assert!((circle.radius - 5.0).abs() < 1e-10);
        assert!(circle.center.x.abs() < 1e-10);
    }
}
