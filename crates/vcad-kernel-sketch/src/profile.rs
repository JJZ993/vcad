//! 2D sketch profile types.

use std::f64::consts::PI;
use vcad_kernel_math::{Dir3, Point2, Point3, Tolerance, Vec3};

use crate::SketchError;

/// A segment of a 2D sketch profile.
#[derive(Debug, Clone)]
pub enum SketchSegment {
    /// A line segment from start to end.
    Line {
        /// Start point in 2D sketch coordinates.
        start: Point2,
        /// End point in 2D sketch coordinates.
        end: Point2,
    },
    /// A circular arc from start to end around a center.
    Arc {
        /// Start point in 2D sketch coordinates.
        start: Point2,
        /// End point in 2D sketch coordinates.
        end: Point2,
        /// Center of the arc in 2D sketch coordinates.
        center: Point2,
        /// If true, arc goes counter-clockwise from start to end.
        ccw: bool,
    },
}

impl SketchSegment {
    /// Get the start point of this segment.
    pub fn start(&self) -> Point2 {
        match self {
            SketchSegment::Line { start, .. } => *start,
            SketchSegment::Arc { start, .. } => *start,
        }
    }

    /// Get the end point of this segment.
    pub fn end(&self) -> Point2 {
        match self {
            SketchSegment::Line { end, .. } => *end,
            SketchSegment::Arc { end, .. } => *end,
        }
    }

    /// Check if this segment is degenerate (zero length).
    pub fn is_degenerate(&self) -> bool {
        let tol = Tolerance::DEFAULT;
        match self {
            SketchSegment::Line { start, end } => (end - start).norm() < tol.linear,
            SketchSegment::Arc {
                start, end, center, ..
            } => {
                // Degenerate if start == end or radius is zero
                let r1 = (start - center).norm();
                let r2 = (end - center).norm();
                r1 < tol.linear || r2 < tol.linear || (end - start).norm() < tol.linear
            }
        }
    }

    /// Get the length of this segment.
    pub fn length(&self) -> f64 {
        match self {
            SketchSegment::Line { start, end } => (end - start).norm(),
            SketchSegment::Arc {
                start,
                end,
                center,
                ccw,
            } => {
                let radius = (start - center).norm();
                let angle = self.arc_angle(*start, *end, *center, *ccw);
                radius * angle.abs()
            }
        }
    }

    fn arc_angle(&self, start: Point2, end: Point2, center: Point2, ccw: bool) -> f64 {
        let d_start = start - center;
        let d_end = end - center;
        let start_angle = d_start.y.atan2(d_start.x);
        let end_angle = d_end.y.atan2(d_end.x);
        let mut angle = end_angle - start_angle;
        if ccw {
            if angle < 0.0 {
                angle += 2.0 * PI;
            }
        } else if angle > 0.0 {
            angle -= 2.0 * PI;
        }
        angle
    }
}

/// A closed 2D profile on a sketch plane.
///
/// The profile is defined in a local 2D coordinate system with an origin
/// point in 3D and two orthogonal direction vectors (x_dir, y_dir).
#[derive(Debug, Clone)]
pub struct SketchProfile {
    /// Origin point of the sketch plane in 3D.
    pub origin: Point3,
    /// Unit vector along the local X axis.
    pub x_dir: Dir3,
    /// Unit vector along the local Y axis.
    pub y_dir: Dir3,
    /// Unit normal to the sketch plane (x_dir × y_dir).
    pub normal: Dir3,
    /// The segments forming the closed profile.
    pub segments: Vec<SketchSegment>,
}

impl SketchProfile {
    /// Create a new sketch profile.
    ///
    /// # Arguments
    ///
    /// * `origin` - Origin point of the sketch plane in 3D
    /// * `x_dir` - Direction vector for the local X axis (will be normalized)
    /// * `y_dir` - Direction vector for the local Y axis (will be normalized)
    /// * `segments` - The segments forming the profile
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The profile has no segments
    /// - Any segment is degenerate
    /// - The profile is not closed (start of first segment != end of last segment)
    pub fn new(
        origin: Point3,
        x_dir: Vec3,
        y_dir: Vec3,
        segments: Vec<SketchSegment>,
    ) -> Result<Self, SketchError> {
        if segments.is_empty() {
            return Err(SketchError::EmptyProfile);
        }

        // Validate segments
        for (i, seg) in segments.iter().enumerate() {
            if seg.is_degenerate() {
                return Err(SketchError::DegenerateSegment(i));
            }
        }

        // Check closure
        let tol = Tolerance::DEFAULT;
        let first_start = segments[0].start();
        let last_end = segments.last().unwrap().end();
        let gap = (last_end - first_start).norm();
        if gap > tol.linear {
            return Err(SketchError::NotClosed(gap));
        }

        // Check continuity between segments
        for i in 0..segments.len() - 1 {
            let this_end = segments[i].end();
            let next_start = segments[i + 1].start();
            let continuity_gap = (next_start - this_end).norm();
            if continuity_gap > tol.linear {
                return Err(SketchError::NotClosed(continuity_gap));
            }
        }

        let x = Dir3::new_normalize(x_dir);
        let y = Dir3::new_normalize(y_dir);
        let n = Dir3::new_normalize(x_dir.cross(&y_dir));

        Ok(Self {
            origin,
            x_dir: x,
            y_dir: y,
            normal: n,
            segments,
        })
    }

    /// Create a rectangular profile.
    ///
    /// The rectangle has corners at:
    /// - `(0, 0)`, `(width, 0)`, `(width, height)`, `(0, height)` in local coords
    ///
    /// Segments go counter-clockwise when viewed from the +normal direction.
    pub fn rectangle(origin: Point3, x_dir: Vec3, y_dir: Vec3, width: f64, height: f64) -> Self {
        let p0 = Point2::new(0.0, 0.0);
        let p1 = Point2::new(width, 0.0);
        let p2 = Point2::new(width, height);
        let p3 = Point2::new(0.0, height);

        let segments = vec![
            SketchSegment::Line { start: p0, end: p1 },
            SketchSegment::Line { start: p1, end: p2 },
            SketchSegment::Line { start: p2, end: p3 },
            SketchSegment::Line { start: p3, end: p0 },
        ];

        // Safe to unwrap since we know this is valid
        Self::new(origin, x_dir, y_dir, segments).unwrap()
    }

    /// Create a circular profile approximated by N arcs.
    ///
    /// The circle is centered at the origin of the sketch plane.
    pub fn circle(origin: Point3, normal: Vec3, radius: f64, n_arcs: u32) -> Self {
        let n = Dir3::new_normalize(normal);
        let arbitrary = if n.as_ref().x.abs() < 0.9 {
            Vec3::x()
        } else {
            Vec3::y()
        };
        let x_dir = arbitrary.cross(n.as_ref());
        let y_dir = n.as_ref().cross(&x_dir);

        let center = Point2::origin();
        let n = n_arcs.max(2) as usize;
        let mut segments = Vec::with_capacity(n);

        for i in 0..n {
            let theta_start = 2.0 * PI * (i as f64) / (n as f64);
            let theta_end = 2.0 * PI * ((i + 1) as f64) / (n as f64);

            let start = Point2::new(radius * theta_start.cos(), radius * theta_start.sin());
            let end = Point2::new(radius * theta_end.cos(), radius * theta_end.sin());

            segments.push(SketchSegment::Arc {
                start,
                end,
                center,
                ccw: true,
            });
        }

        Self::new(origin, x_dir, y_dir, segments).unwrap()
    }

    /// Map a 2D point in sketch coordinates to 3D.
    pub fn to_3d(&self, p: Point2) -> Point3 {
        self.origin + p.x * self.x_dir.as_ref() + p.y * self.y_dir.as_ref()
    }

    /// Map a 3D point to 2D sketch coordinates.
    pub fn to_2d(&self, p: Point3) -> Point2 {
        let d = p - self.origin;
        Point2::new(d.dot(self.x_dir.as_ref()), d.dot(self.y_dir.as_ref()))
    }

    /// Get all segment endpoints (unique vertices of the profile).
    pub fn vertices_2d(&self) -> Vec<Point2> {
        self.segments.iter().map(|s| s.start()).collect()
    }

    /// Get all segment endpoints mapped to 3D.
    pub fn vertices_3d(&self) -> Vec<Point3> {
        self.vertices_2d().iter().map(|p| self.to_3d(*p)).collect()
    }

    /// Check if all segments are lines (no arcs).
    pub fn is_line_only(&self) -> bool {
        self.segments
            .iter()
            .all(|s| matches!(s, SketchSegment::Line { .. }))
    }

    /// Get the number of segments.
    pub fn len(&self) -> usize {
        self.segments.len()
    }

    /// Check if the profile is empty.
    pub fn is_empty(&self) -> bool {
        self.segments.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rectangle_profile() {
        let profile = SketchProfile::rectangle(Point3::origin(), Vec3::x(), Vec3::y(), 10.0, 5.0);
        assert_eq!(profile.segments.len(), 4);
        assert!(profile.is_line_only());
    }

    #[test]
    fn test_circle_profile() {
        let profile = SketchProfile::circle(Point3::origin(), Vec3::z(), 5.0, 4);
        assert_eq!(profile.segments.len(), 4);
        assert!(!profile.is_line_only());
    }

    #[test]
    fn test_to_3d_mapping() {
        let profile =
            SketchProfile::rectangle(Point3::new(10.0, 0.0, 0.0), Vec3::y(), Vec3::z(), 5.0, 3.0);

        // Local (0, 0) should map to origin (10, 0, 0)
        let p0 = profile.to_3d(Point2::new(0.0, 0.0));
        assert!((p0.coords - Point3::new(10.0, 0.0, 0.0).coords).norm() < 1e-12);

        // Local (5, 3) should map to (10, 5, 3) since x_dir=Y, y_dir=Z
        let p1 = profile.to_3d(Point2::new(5.0, 3.0));
        assert!((p1.coords - Point3::new(10.0, 5.0, 3.0).coords).norm() < 1e-12);
    }

    #[test]
    fn test_not_closed_error() {
        let segments = vec![
            SketchSegment::Line {
                start: Point2::new(0.0, 0.0),
                end: Point2::new(10.0, 0.0),
            },
            SketchSegment::Line {
                start: Point2::new(10.0, 0.0),
                end: Point2::new(10.0, 10.0),
            },
            // Gap: ends at (10, 10), profile starts at (0, 0)
        ];

        let result = SketchProfile::new(Point3::origin(), Vec3::x(), Vec3::y(), segments);
        assert!(matches!(result, Err(SketchError::NotClosed(_))));
    }

    #[test]
    fn test_degenerate_segment_error() {
        let segments = vec![SketchSegment::Line {
            start: Point2::new(0.0, 0.0),
            end: Point2::new(0.0, 0.0), // degenerate
        }];

        let result = SketchProfile::new(Point3::origin(), Vec3::x(), Vec3::y(), segments);
        assert!(matches!(result, Err(SketchError::DegenerateSegment(0))));
    }

    #[test]
    fn test_empty_profile_error() {
        let result = SketchProfile::new(Point3::origin(), Vec3::x(), Vec3::y(), vec![]);
        assert!(matches!(result, Err(SketchError::EmptyProfile)));
    }

    #[test]
    fn test_vertices_3d() {
        let profile = SketchProfile::rectangle(Point3::origin(), Vec3::x(), Vec3::y(), 10.0, 5.0);
        let verts = profile.vertices_3d();
        assert_eq!(verts.len(), 4);
        assert!((verts[0].coords - Point3::new(0.0, 0.0, 0.0).coords).norm() < 1e-12);
        assert!((verts[1].coords - Point3::new(10.0, 0.0, 0.0).coords).norm() < 1e-12);
        assert!((verts[2].coords - Point3::new(10.0, 5.0, 0.0).coords).norm() < 1e-12);
        assert!((verts[3].coords - Point3::new(0.0, 5.0, 0.0).coords).norm() < 1e-12);
    }

    #[test]
    fn test_segment_length() {
        let line = SketchSegment::Line {
            start: Point2::new(0.0, 0.0),
            end: Point2::new(3.0, 4.0),
        };
        assert!((line.length() - 5.0).abs() < 1e-12);

        // Full circle arc (4 quarter arcs approximation)
        let arc = SketchSegment::Arc {
            start: Point2::new(5.0, 0.0),
            end: Point2::new(0.0, 5.0),
            center: Point2::origin(),
            ccw: true,
        };
        let expected_len = 5.0 * PI / 2.0; // quarter circle
        assert!((arc.length() - expected_len).abs() < 1e-10);
    }
}
