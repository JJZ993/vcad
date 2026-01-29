//! Trim intersection curves to face domains.
//!
//! After SSI produces an intersection curve between two surfaces,
//! we need to clip it to the actual bounded region of each face.
//! This module tests whether points lie inside a face's trim loops
//! and finds the parameter ranges where the curve enters/exits the face.
//!
//! # Important Implementation Note: Line Trimming Range
//!
//! When trimming a line to a face, we must compute the parameter range (t_min, t_max)
//! based on where the line actually intersects the face's AABB, NOT based on the
//! face's size divided by direction length.
//!
//! ## The Bug That Was Fixed
//!
//! SSI (Surface-Surface Intersection) computes a line between two planes. The line's
//! origin is set to the intersection of the planes' origins, which can be FAR from
//! the actual faces being intersected.
//!
//! Example: Plate at Y=6, Hole face at Z=36
//! - SSI line origin: (0, 6, 36) - at X=0
//! - Hole face X range: [34, 46]
//! - Direction: (-1, 0, 0)
//!
//! Old (buggy) approach:
//! - Face extent ≈ 17.7, direction length = 1.0
//! - t_range = 17.7 * 2 ≈ 35.5
//! - Sampled t from -35.5 to +35.5
//! - Points sampled: X from 35.5 to -35.5
//! - MISSED the face entirely (X=[34,46] requires t≈-34 to -46)
//!
//! Fixed approach:
//! - Use ray-AABB intersection to find t values where line enters/exits face bounds
//! - For X: t = (34 - 0) / (-1) = -34, t = (46 - 0) / (-1) = -46
//! - Sample t from -46 to -34 (with padding)
//! - Correctly covers the face
//!
//! This bug caused hole wall faces (Z=24, Z=36) to not be split at Y=0 and Y=6,
//! resulting in the entire Z face being classified as Outside instead of having
//! a middle strip (Y=0 to Y=6) classified as Inside.

use vcad_kernel_geom::Surface;
use vcad_kernel_math::{Point2, Point3};
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::FaceId;

use crate::ssi::IntersectionCurve;

/// A trimmed segment of an intersection curve, expressed as a parameter range.
#[derive(Debug, Clone)]
pub struct TrimmedSegment {
    /// Start parameter on the intersection curve.
    pub t_start: f64,
    /// End parameter on the intersection curve.
    pub t_end: f64,
}

/// Test if a 2D point is inside a closed polygon using the winding number method.
///
/// `polygon` is a sequence of vertices forming a closed loop (last connects to first).
/// Returns true if the point is inside or on the boundary.
pub fn point_in_polygon(point: &Point2, polygon: &[Point2]) -> bool {
    let n = polygon.len();
    if n < 3 {
        return false;
    }

    let mut winding = 0i32;
    for i in 0..n {
        let j = (i + 1) % n;
        let yi = polygon[i].y;
        let yj = polygon[j].y;

        if yi <= point.y {
            if yj > point.y {
                // Upward crossing
                let val = cross_2d(
                    polygon[j].x - polygon[i].x,
                    polygon[j].y - polygon[i].y,
                    point.x - polygon[i].x,
                    point.y - polygon[i].y,
                );
                if val > 0.0 {
                    winding += 1;
                }
            }
        } else if yj <= point.y {
            // Downward crossing
            let val = cross_2d(
                polygon[j].x - polygon[i].x,
                polygon[j].y - polygon[i].y,
                point.x - polygon[i].x,
                point.y - polygon[i].y,
            );
            if val < 0.0 {
                winding -= 1;
            }
        }
    }

    winding != 0
}

/// 2D cross product: (ax, ay) × (bx, by) = ax*by - ay*bx
fn cross_2d(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    ax * by - ay * bx
}

/// Test if a 3D point on a surface lies inside a face's boundary.
///
/// Projects the point into the face's (u,v) parameter space and tests
/// against the face's trim loops.
pub fn point_in_face(brep: &BRepSolid, face_id: FaceId, point_3d: &Point3) -> bool {
    let topo = &brep.topology;
    let face = &topo.faces[face_id];
    let surface = &brep.geometry.surfaces[face.surface_index];

    // Get the outer loop vertices in UV space
    let outer_verts_3d: Vec<Point3> = topo
        .loop_half_edges(face.outer_loop)
        .map(|he_id| topo.vertices[topo.half_edges[he_id].origin].point)
        .collect();

    // Project vertices to UV space using surface inverse mapping
    let outer_uv = project_points_to_uv(surface.as_ref(), &outer_verts_3d);

    // Project the test point to UV
    let test_uv = project_point_to_uv(surface.as_ref(), point_3d);

    // Test if inside outer loop
    if !point_in_polygon(&test_uv, &outer_uv) {
        return false;
    }

    // Test if outside all inner loops (holes)
    for &inner_loop_id in &face.inner_loops {
        let inner_verts: Vec<Point3> = topo
            .loop_half_edges(inner_loop_id)
            .map(|he_id| topo.vertices[topo.half_edges[he_id].origin].point)
            .collect();
        let inner_uv = project_points_to_uv(surface.as_ref(), &inner_verts);
        if point_in_polygon(&test_uv, &inner_uv) {
            return false; // inside a hole
        }
    }

    true
}

/// Project a 3D point onto a surface's UV parameter space.
///
/// Uses a simple closest-point heuristic for analytic surfaces.
pub fn project_point_to_uv(surface: &dyn Surface, point: &Point3) -> Point2 {
    use vcad_kernel_geom::SurfaceKind;

    match surface.surface_type() {
        SurfaceKind::Plane => {
            // For planes, we can get the exact UV from the Plane struct
            if let Some(plane) = surface.as_any().downcast_ref::<vcad_kernel_geom::Plane>() {
                plane.project(point)
            } else {
                approx_project_to_uv(surface, point)
            }
        }
        SurfaceKind::Cylinder => {
            if let Some(cyl) = surface
                .as_any()
                .downcast_ref::<vcad_kernel_geom::CylinderSurface>()
            {
                // Project: u = atan2(dot(p-center, y_dir), dot(p-center, ref_dir))
                //          v = dot(p-center, axis)
                let d = point - cyl.center;
                let ref_dir = cyl.ref_dir.as_ref();
                let y_dir = cyl.axis.as_ref().cross(ref_dir);
                let u = d.dot(&y_dir).atan2(d.dot(ref_dir));
                let u = if u < 0.0 {
                    u + 2.0 * std::f64::consts::PI
                } else {
                    u
                };
                let v = d.dot(cyl.axis.as_ref());
                Point2::new(u, v)
            } else {
                approx_project_to_uv(surface, point)
            }
        }
        SurfaceKind::Sphere => {
            if let Some(sph) = surface
                .as_any()
                .downcast_ref::<vcad_kernel_geom::SphereSurface>()
            {
                let d = (point - sph.center).normalize();
                let ref_dir = sph.ref_dir.as_ref();
                let y_dir = sph.axis.as_ref().cross(ref_dir);
                let v = d.dot(sph.axis.as_ref()).asin(); // latitude
                let cos_v = v.cos();
                let u = if cos_v.abs() < 1e-12 {
                    0.0 // at pole
                } else {
                    let dx = d.dot(ref_dir) / cos_v;
                    let dy = d.dot(&y_dir) / cos_v;
                    let u = dy.atan2(dx);
                    if u < 0.0 {
                        u + 2.0 * std::f64::consts::PI
                    } else {
                        u
                    }
                };
                Point2::new(u, v)
            } else {
                approx_project_to_uv(surface, point)
            }
        }
        SurfaceKind::Cone => approx_project_to_uv(surface, point),
    }
}

/// Approximate UV projection by searching over the parameter domain.
fn approx_project_to_uv(surface: &dyn Surface, point: &Point3) -> Point2 {
    let ((u_min, u_max), (v_min, v_max)) = surface.domain();
    // Clamp domain for search
    let u_min = u_min.max(-100.0);
    let u_max = u_max.min(100.0);
    let v_min = v_min.max(-100.0);
    let v_max = v_max.min(100.0);

    let n = 20;
    let mut best_uv = Point2::new(0.5 * (u_min + u_max), 0.5 * (v_min + v_max));
    let mut best_dist = f64::INFINITY;

    for i in 0..=n {
        for j in 0..=n {
            let u = u_min + (u_max - u_min) * i as f64 / n as f64;
            let v = v_min + (v_max - v_min) * j as f64 / n as f64;
            let uv = Point2::new(u, v);
            let p = surface.evaluate(uv);
            let dist = (p - point).norm_squared();
            if dist < best_dist {
                best_dist = dist;
                best_uv = uv;
            }
        }
    }

    best_uv
}

/// Project multiple 3D points to UV space on a surface.
fn project_points_to_uv(surface: &dyn Surface, points: &[Point3]) -> Vec<Point2> {
    points
        .iter()
        .map(|p| project_point_to_uv(surface, p))
        .collect()
}

/// Trim an intersection curve to the domain of a face.
///
/// Samples the curve at regular intervals and checks which samples
/// lie inside the face. Returns parameter ranges where the curve
/// is inside the face.
pub fn trim_curve_to_face(
    curve: &IntersectionCurve,
    face_id: FaceId,
    brep: &BRepSolid,
    n_samples: usize,
) -> Vec<TrimmedSegment> {
    match curve {
        IntersectionCurve::Empty => Vec::new(),
        IntersectionCurve::Point(p) => {
            if point_in_face(brep, face_id, p) {
                vec![TrimmedSegment {
                    t_start: 0.0,
                    t_end: 0.0,
                }]
            } else {
                Vec::new()
            }
        }
        IntersectionCurve::Line(line) => {
            // CRITICAL: Use ray-AABB intersection to find the parameter range.
            //
            // The line's origin comes from SSI (Surface-Surface Intersection) and may be
            // FAR from the face. We cannot simply use face_extent/direction_length as the
            // range - that was a bug that caused hole walls to not be split correctly.
            //
            // Example of the bug:
            //   Line origin: (0, 6, 36), direction: (-1, 0, 0)
            //   Face X range: [34, 46]
            //   Old code: t_range = 17.7, sampled t from -17.7 to +17.7
            //   But we need t = -34 to -46 to reach the face!
            //
            // See module-level docs for full explanation.
            let aabb = crate::bbox::face_aabb(brep, face_id);
            let dir_len = line.direction.norm();
            if dir_len < 1e-15 {
                return Vec::new();
            }

            // Ray-slab intersection: for each axis, find t where line enters/exits AABB
            let mut t_min = f64::NEG_INFINITY;
            let mut t_max = f64::INFINITY;

            // X axis
            if line.direction.x.abs() > 1e-15 {
                let t1 = (aabb.min.x - line.origin.x) / line.direction.x;
                let t2 = (aabb.max.x - line.origin.x) / line.direction.x;
                let (t_enter, t_exit) = if t1 < t2 { (t1, t2) } else { (t2, t1) };
                t_min = t_min.max(t_enter);
                t_max = t_max.min(t_exit);
            } else if line.origin.x < aabb.min.x || line.origin.x > aabb.max.x {
                return Vec::new(); // Line parallel to X but outside X range
            }

            // Y axis
            if line.direction.y.abs() > 1e-15 {
                let t1 = (aabb.min.y - line.origin.y) / line.direction.y;
                let t2 = (aabb.max.y - line.origin.y) / line.direction.y;
                let (t_enter, t_exit) = if t1 < t2 { (t1, t2) } else { (t2, t1) };
                t_min = t_min.max(t_enter);
                t_max = t_max.min(t_exit);
            } else if line.origin.y < aabb.min.y || line.origin.y > aabb.max.y {
                return Vec::new(); // Line parallel to Y but outside Y range
            }

            // Z axis
            if line.direction.z.abs() > 1e-15 {
                let t1 = (aabb.min.z - line.origin.z) / line.direction.z;
                let t2 = (aabb.max.z - line.origin.z) / line.direction.z;
                let (t_enter, t_exit) = if t1 < t2 { (t1, t2) } else { (t2, t1) };
                t_min = t_min.max(t_enter);
                t_max = t_max.min(t_exit);
            } else if line.origin.z < aabb.min.z || line.origin.z > aabb.max.z {
                return Vec::new(); // Line parallel to Z but outside Z range
            }

            // If t_min > t_max, line doesn't intersect AABB
            if t_min > t_max {
                return Vec::new();
            }

            // Expand slightly to ensure we catch boundaries
            let padding = (t_max - t_min).max(1.0) * 0.1;
            t_min -= padding;
            t_max += padding;

            sample_and_trim(
                |t| line.origin + t * line.direction,
                t_min,
                t_max,
                n_samples,
                face_id,
                brep,
            )
        }
        IntersectionCurve::Circle(circle) => {
            use std::f64::consts::PI;
            sample_and_trim(
                |t| {
                    let (sin_t, cos_t) = t.sin_cos();
                    circle.center
                        + circle.radius
                            * (cos_t * circle.x_dir.into_inner()
                                + sin_t * circle.y_dir.into_inner())
                },
                0.0,
                2.0 * PI,
                n_samples,
                face_id,
                brep,
            )
        }
        IntersectionCurve::Sampled(points) => {
            // For sampled curves, test each point directly
            let mut segments = Vec::new();
            let n = points.len();
            if n == 0 {
                return segments;
            }

            let mut in_segment = false;
            let mut seg_start = 0.0;

            for (i, p) in points.iter().enumerate() {
                let t = i as f64 / (n - 1).max(1) as f64;
                let inside = point_in_face(brep, face_id, p);

                if inside && !in_segment {
                    seg_start = t;
                    in_segment = true;
                } else if !inside && in_segment {
                    segments.push(TrimmedSegment {
                        t_start: seg_start,
                        t_end: t,
                    });
                    in_segment = false;
                }
            }

            if in_segment {
                segments.push(TrimmedSegment {
                    t_start: seg_start,
                    t_end: 1.0,
                });
            }

            segments
        }
    }
}

/// Binary search to refine the exact parameter where inside/outside status changes.
fn refine_crossing(
    eval: &impl Fn(f64) -> Point3,
    t_inside: f64,
    t_outside: f64,
    face_id: FaceId,
    brep: &BRepSolid,
    iterations: usize,
) -> f64 {
    let mut t_in = t_inside;
    let mut t_out = t_outside;
    for _ in 0..iterations {
        let t_mid = 0.5 * (t_in + t_out);
        let p = eval(t_mid);
        if point_in_face(brep, face_id, &p) {
            t_in = t_mid;
        } else {
            t_out = t_mid;
        }
    }
    // Return the inside boundary (last point that's inside)
    t_in
}

/// Generic helper: sample a curve, test each sample point against a face,
/// and return parameter ranges where the curve is inside the face.
/// Uses binary search to refine boundary crossings for accuracy.
fn sample_and_trim(
    eval: impl Fn(f64) -> Point3,
    t_min: f64,
    t_max: f64,
    n_samples: usize,
    face_id: FaceId,
    brep: &BRepSolid,
) -> Vec<TrimmedSegment> {
    let mut segments = Vec::new();
    let n = n_samples.max(2);

    // First pass: find sample transitions
    let mut samples: Vec<(f64, bool)> = Vec::with_capacity(n + 1);
    for i in 0..=n {
        let t = t_min + (t_max - t_min) * i as f64 / n as f64;
        let p = eval(t);
        let inside = point_in_face(brep, face_id, &p);
        samples.push((t, inside));
    }

    // Find transitions and refine them
    let mut in_segment = false;
    let mut seg_start = t_min;

    for i in 1..samples.len() {
        let (t_prev, inside_prev) = samples[i - 1];
        let (t_curr, inside_curr) = samples[i];

        if inside_curr && !inside_prev {
            // Transition from outside to inside - refine to find exact entry
            seg_start = refine_crossing(&eval, t_curr, t_prev, face_id, brep, 20);
            in_segment = true;
        } else if !inside_curr && inside_prev {
            // Transition from inside to outside - refine to find exact exit
            let seg_end = refine_crossing(&eval, t_prev, t_curr, face_id, brep, 20);
            if in_segment {
                segments.push(TrimmedSegment {
                    t_start: seg_start,
                    t_end: seg_end,
                });
                in_segment = false;
            }
        }
    }

    // Handle segment that extends to end
    if in_segment {
        // Check if we should refine the end or use t_max
        let (t_last, inside_last) = samples[samples.len() - 1];
        if inside_last {
            segments.push(TrimmedSegment {
                t_start: seg_start,
                t_end: t_last,
            });
        }
    }

    // Handle case where first sample is inside (segment starts from beginning)
    if !segments.is_empty() {
        return segments;
    }

    // If no transitions found but some samples are inside, the entire sampled range might be inside
    if samples.iter().any(|(_, inside)| *inside) && samples.iter().all(|(_, inside)| *inside) {
        return vec![TrimmedSegment {
            t_start: t_min,
            t_end: t_max,
        }];
    }

    segments
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_point_in_polygon_square() {
        let square = vec![
            Point2::new(0.0, 0.0),
            Point2::new(10.0, 0.0),
            Point2::new(10.0, 10.0),
            Point2::new(0.0, 10.0),
        ];

        assert!(point_in_polygon(&Point2::new(5.0, 5.0), &square));
        assert!(!point_in_polygon(&Point2::new(15.0, 5.0), &square));
        assert!(!point_in_polygon(&Point2::new(-1.0, 5.0), &square));
    }

    #[test]
    fn test_point_in_polygon_triangle() {
        let triangle = vec![
            Point2::new(0.0, 0.0),
            Point2::new(10.0, 0.0),
            Point2::new(5.0, 10.0),
        ];

        assert!(point_in_polygon(&Point2::new(5.0, 3.0), &triangle));
        assert!(!point_in_polygon(&Point2::new(0.0, 10.0), &triangle));
    }

    #[test]
    fn test_point_in_face_cube() {
        use vcad_kernel_primitives::make_cube;

        let brep = make_cube(10.0, 10.0, 10.0);
        // Pick the bottom face (z=0 plane)
        // Find a face whose vertices all have z=0
        let bottom_face = brep.topology.faces.iter().find(|(fid, _)| {
            let verts: Vec<Point3> = brep
                .topology
                .loop_half_edges(brep.topology.faces[*fid].outer_loop)
                .map(|he| brep.topology.vertices[brep.topology.half_edges[he].origin].point)
                .collect();
            verts.iter().all(|v| v.z.abs() < 1e-10)
        });

        if let Some((fid, _)) = bottom_face {
            // Point on the face interior
            let inside = point_in_face(&brep, fid, &Point3::new(5.0, 5.0, 0.0));
            assert!(inside);

            // Point outside the face
            let outside = point_in_face(&brep, fid, &Point3::new(15.0, 5.0, 0.0));
            assert!(!outside);
        }
    }

    #[test]
    fn test_trim_empty_curve() {
        use vcad_kernel_primitives::make_cube;
        let brep = make_cube(10.0, 10.0, 10.0);
        let face_id = brep.topology.faces.iter().next().unwrap().0;

        let segments = trim_curve_to_face(&IntersectionCurve::Empty, face_id, &brep, 100);
        assert!(segments.is_empty());
    }
}
