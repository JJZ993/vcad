//! Face splitting along intersection curves.
//!
//! Given a face and intersection curves that cross it, split the face
//! into sub-faces. Each sub-face inherits the original face's surface
//! but has a new trim loop.
//!
//! For Phase 2, we focus on planar face splitting by lines/segments.
//! Curved face splitting extends naturally once the planar case works.

use vcad_kernel_math::Point3;
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::{FaceId, Orientation};

use crate::ssi::IntersectionCurve;

/// Result of splitting a face.
#[derive(Debug, Clone)]
pub struct SplitResult {
    /// The face IDs of the newly created sub-faces.
    /// If no splitting occurred, contains just the original face ID.
    pub sub_faces: Vec<FaceId>,
}

/// Split a face along an intersection curve.
///
/// The curve must already be trimmed to the face's domain. This function:
/// 1. Projects the curve into UV space
/// 2. Finds where it enters/exits the face boundary
/// 3. Splits the boundary loop at entry/exit points
/// 4. Creates two new face loops
///
/// For the initial implementation, this handles the common case of a
/// planar face split by a line segment. The line must cross the face
/// boundary at exactly 2 points.
pub fn split_face_by_curve(
    brep: &mut BRepSolid,
    face_id: FaceId,
    _curve: &IntersectionCurve,
    entry_point: &Point3,
    exit_point: &Point3,
) -> SplitResult {
    // Get face info
    let face = &brep.topology.faces[face_id];
    let surface_index = face.surface_index;
    let orientation = face.orientation;
    let outer_loop = face.outer_loop;
    let _surface = &brep.geometry.surfaces[surface_index];

    // Get outer loop vertices in order
    let loop_hes: Vec<_> = brep.topology.loop_half_edges(outer_loop).collect();
    let loop_verts: Vec<Point3> = loop_hes
        .iter()
        .map(|&he| brep.topology.vertices[brep.topology.half_edges[he].origin].point)
        .collect();

    let n = loop_verts.len();
    if n < 3 {
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // Find the two edges where the curve enters and exits the face
    let (entry_edge, entry_dist) = find_closest_edge_with_dist(&loop_verts, entry_point);
    let (exit_edge, exit_dist) = find_closest_edge_with_dist(&loop_verts, exit_point);

    // If entry or exit point is too far from any edge, the split line doesn't cross this face
    let max_dist_tolerance = 1.0; // Allow some tolerance for numerical precision
    if entry_dist > max_dist_tolerance || exit_dist > max_dist_tolerance {
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    if entry_edge == exit_edge {
        // Curve enters and exits on the same edge — can't split simply
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // Insert new vertices at entry and exit points
    let _v_entry = brep.topology.add_vertex(*entry_point);
    let _v_exit = brep.topology.add_vertex(*exit_point);

    // Build two new vertex loops by walking the original loop
    // Loop 1: entry_point → (edges from entry to exit) → exit_point → (cut back)
    // Loop 2: exit_point → (edges from exit to entry) → entry_point → (cut back)

    let mut loop1_points: Vec<Point3> = Vec::new();
    let mut loop2_points: Vec<Point3> = Vec::new();

    // Walk from entry_edge to exit_edge (one direction)
    loop1_points.push(*entry_point);
    let mut idx = (entry_edge + 1) % n;
    while idx != (exit_edge + 1) % n {
        loop1_points.push(loop_verts[idx]);
        idx = (idx + 1) % n;
    }
    loop1_points.push(*exit_point);

    // Walk from exit_edge to entry_edge (other direction)
    loop2_points.push(*exit_point);
    idx = (exit_edge + 1) % n;
    while idx != (entry_edge + 1) % n {
        loop2_points.push(loop_verts[idx]);
        idx = (idx + 1) % n;
    }
    loop2_points.push(*entry_point);

    // Need at least 3 vertices for a valid face
    if loop1_points.len() < 3 || loop2_points.len() < 3 {
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // Create topology for the two new faces
    let face1 = create_face_from_points(brep, &loop1_points, surface_index, orientation);
    let face2 = create_face_from_points(brep, &loop2_points, surface_index, orientation);

    // Add the new faces to the shell
    if let Some(shell_id) = brep.topology.faces[face_id].shell {
        brep.topology.shells[shell_id].faces.push(face1);
        brep.topology.shells[shell_id].faces.push(face2);

        // Set shell on new faces
        brep.topology.faces[face1].shell = Some(shell_id);
        brep.topology.faces[face2].shell = Some(shell_id);

        // Remove original face from shell
        brep.topology.shells[shell_id]
            .faces
            .retain(|&f| f != face_id);
    }

    // Remove the original face from topology (it's been replaced by sub-faces)
    brep.topology.faces.remove(face_id);

    SplitResult {
        sub_faces: vec![face1, face2],
    }
}

/// Find which edge of a polygon a point lies closest to.
/// Returns the index of the starting vertex of that edge.
#[cfg(test)]
fn find_closest_edge(polygon: &[Point3], point: &Point3) -> usize {
    find_closest_edge_with_dist(polygon, point).0
}

/// Find which edge of a polygon a point lies closest to.
/// Returns (edge_index, distance) where edge_index is the starting vertex of that edge.
fn find_closest_edge_with_dist(polygon: &[Point3], point: &Point3) -> (usize, f64) {
    let n = polygon.len();
    let mut best = 0;
    let mut best_dist = f64::INFINITY;

    for i in 0..n {
        let j = (i + 1) % n;
        let dist = point_to_segment_dist(point, &polygon[i], &polygon[j]);
        if dist < best_dist {
            best_dist = dist;
            best = i;
        }
    }

    (best, best_dist)
}

/// Find an existing vertex at the given point, or create a new one.
fn find_or_create_vertex(
    brep: &mut BRepSolid,
    point: &Point3,
    tolerance: f64,
) -> vcad_kernel_topo::VertexId {
    // Search for existing vertex within tolerance
    for (vid, vertex) in &brep.topology.vertices {
        let dist = (vertex.point - point).norm();
        if dist < tolerance {
            return vid;
        }
    }
    // No existing vertex found, create new one
    brep.topology.add_vertex(*point)
}

/// Distance from a point to a line segment.
fn point_to_segment_dist(p: &Point3, a: &Point3, b: &Point3) -> f64 {
    let ab = b - a;
    let ap = p - a;
    let len2 = ab.norm_squared();
    if len2 < 1e-20 {
        return ap.norm();
    }
    let t = ap.dot(&ab) / len2;
    let t = t.clamp(0.0, 1.0);
    let proj = a + t * ab;
    (p - proj).norm()
}

/// Find where an infinite line crosses the edges of a 3D polygon.
///
/// The polygon vertices must be coplanar. Returns the crossing points
/// in order along the line direction.
fn find_line_polygon_crossings(
    polygon: &[Point3],
    line: &vcad_kernel_geom::Line3d,
) -> Vec<Point3> {
    let n = polygon.len();
    if n < 3 {
        return Vec::new();
    }

    // Compute the polygon's plane normal from the first 3 vertices
    let e1 = polygon[1] - polygon[0];
    let e2 = polygon[2] - polygon[0];
    let plane_normal = e1.cross(&e2);
    let plane_normal_len = plane_normal.norm();
    if plane_normal_len < 1e-12 {
        return Vec::new(); // Degenerate polygon
    }
    let plane_normal = plane_normal / plane_normal_len;

    // Build a 2D coordinate system on the plane
    let x_axis = e1.normalize();
    let y_axis = plane_normal.cross(&x_axis);

    // Project polygon vertices and line to 2D
    let project_to_2d = |p: &Point3| -> (f64, f64) {
        let d = *p - polygon[0];
        (d.dot(&x_axis), d.dot(&y_axis))
    };

    let poly_2d: Vec<(f64, f64)> = polygon.iter().map(&project_to_2d).collect();

    // Project line origin and direction
    let (ox, oy) = project_to_2d(&line.origin);
    let dx = line.direction.dot(&x_axis);
    let dy = line.direction.dot(&y_axis);
    let dir_2d_len = (dx * dx + dy * dy).sqrt();

    if dir_2d_len < 1e-12 {
        // Line is perpendicular to the polygon plane - no crossing
        return Vec::new();
    }

    let mut crossings = Vec::new();
    let tol = 1e-9;

    for i in 0..n {
        let j = (i + 1) % n;
        let (ax, ay) = poly_2d[i];
        let (bx, by) = poly_2d[j];

        // Segment direction in 2D
        let sx = bx - ax;
        let sy = by - ay;
        let seg_len = (sx * sx + sy * sy).sqrt();
        if seg_len < tol {
            continue;
        }

        // Solve: (ox + t * dx, oy + t * dy) = (ax + s * sx, ay + s * sy)
        // Matrix form: det = sx * dy - dx * sy
        let det = sx * dy - dx * sy;
        if det.abs() < tol {
            // Lines are parallel
            continue;
        }

        let rhs_x = ax - ox;
        let rhs_y = ay - oy;

        // Cramer's rule
        let t = (sx * rhs_y - sy * rhs_x) / det;
        let s = (dx * rhs_y - dy * rhs_x) / det;

        // s is the parameter along the segment [0, 1]
        if s < -tol || s > 1.0 + tol {
            continue;
        }

        // Compute the 3D intersection point
        let intersection = line.origin + t * line.direction;

        // Avoid duplicate crossings at vertices
        let is_duplicate = crossings.iter().any(|c: &Point3| (*c - intersection).norm() < 0.01);
        if !is_duplicate {
            crossings.push(intersection);
        }
    }

    // Sort crossings by their parameter along the line
    let line_dir = line.direction.normalize();
    crossings.sort_by(|a, b| {
        let ta = (*a - line.origin).dot(&line_dir);
        let tb = (*b - line.origin).dot(&line_dir);
        ta.partial_cmp(&tb).unwrap_or(std::cmp::Ordering::Equal)
    });

    crossings
}

/// Create a new face in the BRep from a set of 3D points.
///
/// Reuses existing vertices within tolerance, creating new ones only when needed.
fn create_face_from_points(
    brep: &mut BRepSolid,
    points: &[Point3],
    surface_index: usize,
    orientation: Orientation,
) -> FaceId {
    // Create or reuse vertices - reuse existing vertices within tolerance
    let tolerance = 1e-6;
    let verts: Vec<_> = points
        .iter()
        .map(|p| find_or_create_vertex(brep, p, tolerance))
        .collect();

    // Create half-edges
    let hes: Vec<_> = verts
        .iter()
        .map(|&v| brep.topology.add_half_edge(v))
        .collect();

    // Create loop
    let loop_id = brep.topology.add_loop(&hes);

    // Create face
    brep.topology.add_face(loop_id, surface_index, orientation)
}

/// Split all intersected faces of a solid.
///
/// For each face that has intersection curves crossing it,
/// split the face into sub-faces.
///
/// Returns a mapping from original face IDs to their split results.
pub fn split_intersected_faces(
    brep: &mut BRepSolid,
    face_intersections: &[(FaceId, IntersectionCurve, Point3, Point3)],
) -> Vec<SplitResult> {
    let mut results = Vec::new();

    for (face_id, curve, entry, exit) in face_intersections {
        let result = split_face_by_curve(brep, *face_id, curve, entry, exit);
        results.push(result);
    }

    results
}

// =============================================================================
// Planar Face Splitting by Circle
// =============================================================================

/// Check if a face's underlying surface is a plane.
pub fn is_planar_face(brep: &BRepSolid, face_id: FaceId) -> bool {
    let face = &brep.topology.faces[face_id];
    let surface = &brep.geometry.surfaces[face.surface_index];
    surface.surface_type() == vcad_kernel_geom::SurfaceKind::Plane
}

/// Split a planar face along a circle intersection curve.
///
/// When a cylinder axis is perpendicular to a plane and they intersect,
/// the result is a circle on the plane. This function splits the planar face into:
/// - An inner face (the disk bounded by the circle)
/// - An outer face (the original polygon with a circular hole)
///
/// The outer face has two loops:
/// - Outer loop: the original polygon boundary
/// - Inner loop: the circle (oriented opposite to outer loop)
///
/// For tessellation, the inner circle is approximated with `segments` vertices.
pub fn split_planar_face_by_circle(
    brep: &mut BRepSolid,
    face_id: FaceId,
    circle: &vcad_kernel_geom::Circle3d,
    segments: u32,
) -> SplitResult {
    let face = &brep.topology.faces[face_id];
    let surface_index = face.surface_index;
    let orientation = face.orientation;
    let outer_loop = face.outer_loop;

    // Get outer loop vertices to check if circle is inside the face
    let loop_hes: Vec<_> = brep.topology.loop_half_edges(outer_loop).collect();
    let loop_verts: Vec<Point3> = loop_hes
        .iter()
        .map(|&he| brep.topology.vertices[brep.topology.half_edges[he].origin].point)
        .collect();

    if loop_verts.len() < 3 {
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // Check if the FULL circle is inside the polygon
    // We need to verify not just that the circle overlaps, but that it's fully contained.
    // If only partially inside, skip the split (classification will handle it).
    if !circle_fully_inside_polygon(&loop_verts, circle) {
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // Generate circle vertices (CCW when viewed from face normal direction)
    // The circle's normal should align with the plane normal
    let circle_verts: Vec<Point3> = (0..segments)
        .map(|i| {
            let theta = 2.0 * std::f64::consts::PI * (i as f64) / (segments as f64);
            let (sin_t, cos_t) = theta.sin_cos();
            circle.center
                + circle.radius
                    * (cos_t * circle.x_dir.into_inner() + sin_t * circle.y_dir.into_inner())
        })
        .collect();

    // Create inner face (disk) - uses circle vertices as its outer loop
    // The inner face's loop should be oriented the same as the parent face
    let tolerance = 1e-6;
    let inner_verts: Vec<_> = circle_verts
        .iter()
        .map(|p| find_or_create_vertex(brep, p, tolerance))
        .collect();

    let inner_hes: Vec<_> = inner_verts
        .iter()
        .map(|&v| brep.topology.add_half_edge(v))
        .collect();

    let inner_loop = brep.topology.add_loop(&inner_hes);
    let inner_face = brep
        .topology
        .add_face(inner_loop, surface_index, orientation);

    // Create outer face (polygon with hole)
    // The outer loop stays the same; we add the circle as an inner loop
    // The inner loop must have OPPOSITE winding to the outer loop in the face's 2D projection

    // Compute the face's 2D coordinate system from the outer loop
    let e1 = loop_verts[1] - loop_verts[0];
    let e2 = loop_verts[2] - loop_verts[0];
    let face_normal = e1.cross(&e2);
    let u_axis = e1.normalize();
    let v_axis = face_normal.cross(&e1).normalize();
    let origin = loop_verts[0];

    // Project to 2D
    let project = |p: &Point3| -> (f64, f64) {
        let d = *p - origin;
        (d.dot(&u_axis), d.dot(&v_axis))
    };

    // Compute signed area to determine winding direction
    // Positive = CCW, Negative = CW in our 2D projection
    let signed_area = |pts: &[Point3]| -> f64 {
        let pts_2d: Vec<_> = pts.iter().map(&project).collect();
        let mut area = 0.0;
        for i in 0..pts_2d.len() {
            let j = (i + 1) % pts_2d.len();
            area += pts_2d[i].0 * pts_2d[j].1 - pts_2d[j].0 * pts_2d[i].1;
        }
        area / 2.0
    };

    let outer_area = signed_area(&loop_verts);
    let circle_area = signed_area(&circle_verts);

    // Inner loop should have opposite sign to outer loop
    // If they have the same sign, we need to reverse the circle vertices
    let need_reverse = (outer_area > 0.0) == (circle_area > 0.0);

    let inner_loop_verts: Vec<Point3> = if need_reverse {
        circle_verts.iter().rev().cloned().collect()
    } else {
        circle_verts.clone()
    };

    let outer_inner_verts: Vec<_> = inner_loop_verts
        .iter()
        .map(|p| find_or_create_vertex(brep, p, tolerance))
        .collect();

    // Create new outer loop (copy of original)
    let outer_verts: Vec<_> = loop_verts
        .iter()
        .map(|p| find_or_create_vertex(brep, p, tolerance))
        .collect();

    let outer_hes: Vec<_> = outer_verts
        .iter()
        .map(|&v| brep.topology.add_half_edge(v))
        .collect();

    let new_outer_loop = brep.topology.add_loop(&outer_hes);
    let outer_face = brep
        .topology
        .add_face(new_outer_loop, surface_index, orientation);

    // Add the inner loop (hole) to the outer face
    let hole_hes: Vec<_> = outer_inner_verts
        .iter()
        .map(|&v| brep.topology.add_half_edge(v))
        .collect();

    let hole_loop = brep.topology.add_loop(&hole_hes);
    brep.topology.faces[outer_face].inner_loops.push(hole_loop);

    // Copy existing inner loops from the original face to preserve previous holes
    let existing_inner_loops = brep.topology.faces[face_id].inner_loops.clone();
    for existing_loop in existing_inner_loops {
        // Re-create the inner loop with new half-edges for the new face
        let loop_verts_existing: Vec<Point3> = brep
            .topology
            .loop_half_edges(existing_loop)
            .map(|he| brep.topology.vertices[brep.topology.half_edges[he].origin].point)
            .collect();

        let new_verts: Vec<_> = loop_verts_existing
            .iter()
            .map(|p| find_or_create_vertex(brep, p, tolerance))
            .collect();

        let new_hes: Vec<_> = new_verts
            .iter()
            .map(|&v| brep.topology.add_half_edge(v))
            .collect();

        let new_loop = brep.topology.add_loop(&new_hes);
        brep.topology.faces[outer_face].inner_loops.push(new_loop);
    }

    // Add twin edges between inner face circle and outer face hole
    // (they share the same physical edges but with opposite orientation)
    for i in 0..segments as usize {
        let inner_he = inner_hes[i];
        // The outer hole is reversed, so we need to match edges correctly
        // inner_hes[i] corresponds to outer_inner_hes[segments - 1 - i]
        let outer_he = hole_hes[(segments as usize - 1 - i) % segments as usize];
        brep.topology.add_edge(inner_he, outer_he);
    }

    // Add the new faces to the shell
    if let Some(shell_id) = brep.topology.faces[face_id].shell {
        brep.topology.shells[shell_id].faces.push(inner_face);
        brep.topology.shells[shell_id].faces.push(outer_face);

        brep.topology.faces[inner_face].shell = Some(shell_id);
        brep.topology.faces[outer_face].shell = Some(shell_id);

        // Remove original face from shell
        brep.topology.shells[shell_id]
            .faces
            .retain(|&f| f != face_id);
    }

    // Remove the original face
    brep.topology.faces.remove(face_id);

    // Add the 3D circle curve to geometry
    brep.geometry.add_curve_3d(Box::new(circle.clone()));

    SplitResult {
        sub_faces: vec![inner_face, outer_face],
    }
}

/// Check if a circle is FULLY inside a polygon (in 3D, assumes coplanar).
///
/// Returns true only if the entire circle is contained within the polygon.
/// Used by split_planar_face_by_circle to decide whether to create a full disk.
fn circle_fully_inside_polygon(polygon: &[Point3], circle: &vcad_kernel_geom::Circle3d) -> bool {
    if polygon.len() < 3 {
        return false;
    }

    // Compute plane basis from first 3 vertices
    let v0 = polygon[0];
    let v1 = polygon[1];
    let v2 = polygon[2];

    let e1 = v1 - v0;
    let e2 = v2 - v0;
    let normal = e1.cross(&e2);
    let normal_len = normal.norm();
    if normal_len < 1e-12 {
        return false;
    }

    // Project all points to 2D
    let u_axis = e1.normalize();
    let v_axis = normal.cross(&e1).normalize();

    let project = |p: &Point3| -> (f64, f64) {
        let d = p - v0;
        (d.dot(&u_axis), d.dot(&v_axis))
    };

    // Project circle center
    let (cx, cy) = project(&circle.center);

    // Project polygon vertices
    let poly_2d: Vec<(f64, f64)> = polygon.iter().map(project).collect();

    // Check if circle center is inside the polygon
    if !point_in_polygon_2d(cx, cy, &poly_2d) {
        return false;
    }

    // Check that the circle doesn't cross any polygon edge
    // i.e., distance from center to each edge must be > radius
    let n = poly_2d.len();
    for i in 0..n {
        let j = (i + 1) % n;
        let (x1, y1) = poly_2d[i];
        let (x2, y2) = poly_2d[j];

        let dist = point_to_segment_dist_2d(cx, cy, x1, y1, x2, y2);
        if dist < circle.radius - 1e-6 {
            // Circle crosses this edge - not fully inside
            return false;
        }
    }

    true
}

/// Check if a circle overlaps with a polygon (in 3D, assumes coplanar).
///
/// Returns true if any part of the circle is inside the polygon.
/// This handles edge cases like:
/// - Circle center on polygon boundary or corner
/// - Circle partially overlapping the polygon
#[allow(dead_code)]
fn circle_inside_polygon(polygon: &[Point3], circle: &vcad_kernel_geom::Circle3d) -> bool {
    if polygon.len() < 3 {
        return false;
    }

    // Compute plane basis from first 3 vertices
    let v0 = polygon[0];
    let v1 = polygon[1];
    let v2 = polygon[2];

    let e1 = v1 - v0;
    let e2 = v2 - v0;
    let normal = e1.cross(&e2);
    let normal_len = normal.norm();
    if normal_len < 1e-12 {
        return false;
    }

    // Project all points to 2D
    let u_axis = e1.normalize();
    let v_axis = normal.cross(&e1).normalize();

    let project = |p: &Point3| -> (f64, f64) {
        let d = p - v0;
        (d.dot(&u_axis), d.dot(&v_axis))
    };

    // Project circle center
    let (cx, cy) = project(&circle.center);

    // Project polygon vertices
    let poly_2d: Vec<(f64, f64)> = polygon.iter().map(project).collect();

    // Check if circle center is inside the polygon
    let center_inside = point_in_polygon_2d(cx, cy, &poly_2d);

    // If center is inside, circle definitely overlaps
    if center_inside {
        return true;
    }

    // Check if center is very close to polygon boundary (tolerance for numerical precision)
    let tol = 1e-6;
    let n = poly_2d.len();
    for i in 0..n {
        let j = (i + 1) % n;
        let (xi, yi) = poly_2d[i];
        let (xj, yj) = poly_2d[j];

        // Distance from center to this edge
        let dist = point_to_segment_dist_2d(cx, cy, xi, yi, xj, yj);
        if dist < tol {
            // Center is on the boundary - check if any part of the circle is inside
            // Sample points on the circle and check if any are inside
            for k in 0..8 {
                let theta = std::f64::consts::PI * 2.0 * (k as f64) / 8.0;
                let px = cx + circle.radius * theta.cos();
                let py = cy + circle.radius * theta.sin();
                if point_in_polygon_2d(px, py, &poly_2d) {
                    return true;
                }
            }
            // Also check if circle intersects any polygon edge
            return circle_intersects_polygon_edges(cx, cy, circle.radius, &poly_2d);
        }
    }

    // Check if circle intersects any polygon edge
    circle_intersects_polygon_edges(cx, cy, circle.radius, &poly_2d)
}

/// Point-in-polygon test using ray casting (2D version).
fn point_in_polygon_2d(px: f64, py: f64, polygon: &[(f64, f64)]) -> bool {
    let mut inside = false;
    let n = polygon.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = polygon[i];
        let (xj, yj) = polygon[j];

        if ((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Distance from point to line segment (2D).
fn point_to_segment_dist_2d(px: f64, py: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len2 = dx * dx + dy * dy;
    if len2 < 1e-15 {
        return ((px - x1).powi(2) + (py - y1).powi(2)).sqrt();
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    let t = t.clamp(0.0, 1.0);
    let proj_x = x1 + t * dx;
    let proj_y = y1 + t * dy;
    ((px - proj_x).powi(2) + (py - proj_y).powi(2)).sqrt()
}

/// Check if a circle intersects any edge of a polygon.
fn circle_intersects_polygon_edges(cx: f64, cy: f64, radius: f64, polygon: &[(f64, f64)]) -> bool {
    let n = polygon.len();
    for i in 0..n {
        let j = (i + 1) % n;
        let (x1, y1) = polygon[i];
        let (x2, y2) = polygon[j];

        let dist = point_to_segment_dist_2d(cx, cy, x1, y1, x2, y2);
        if dist <= radius {
            return true;
        }
    }
    false
}

/// Split a planar face along an intersection curve.
///
/// This dispatches to the appropriate split method based on the curve type:
/// - Circle: creates inner disk + outer face with hole
/// - Line: entry/exit split (existing implementation)
pub fn split_planar_face(
    brep: &mut BRepSolid,
    face_id: FaceId,
    curve: &IntersectionCurve,
    entry: &Point3,
    exit: &Point3,
    segments: u32,
) -> SplitResult {
    match curve {
        IntersectionCurve::Circle(circle) => {
            split_planar_face_by_circle(brep, face_id, circle, segments)
        }
        IntersectionCurve::Line(line) => {
            // Get face boundary vertices
            let face = &brep.topology.faces[face_id];
            let loop_hes: Vec<_> = brep.topology.loop_half_edges(face.outer_loop).collect();
            let loop_verts: Vec<Point3> = loop_hes
                .iter()
                .map(|&he| brep.topology.vertices[brep.topology.half_edges[he].origin].point)
                .collect();

            // Find where the line intersects the polygon edges
            let crossings = find_line_polygon_crossings(&loop_verts, line);

            if crossings.len() >= 2 {
                // Use the first two crossings as entry/exit
                let actual_entry = crossings[0];
                let actual_exit = crossings[1];
                split_face_by_curve(brep, face_id, curve, &actual_entry, &actual_exit)
            } else {
                // Line doesn't cross the polygon boundary at two points
                SplitResult {
                    sub_faces: vec![face_id],
                }
            }
        }
        IntersectionCurve::TwoLines(line1, _line2) => {
            // TwoLines should be expanded before calling this function.
            // If we get here, just process the first line.
            split_planar_face(
                brep,
                face_id,
                &IntersectionCurve::Line(line1.clone()),
                entry,
                exit,
                segments,
            )
        }
        _ => {
            // Use existing line-based split
            split_face_by_curve(brep, face_id, curve, entry, exit)
        }
    }
}

// =============================================================================
// Cylindrical Face Splitting
// =============================================================================

/// Check if a face's underlying surface is a cylinder.
pub fn is_cylindrical_face(brep: &BRepSolid, face_id: FaceId) -> bool {
    let face = &brep.topology.faces[face_id];
    let surface = &brep.geometry.surfaces[face.surface_index];
    surface.surface_type() == vcad_kernel_geom::SurfaceKind::Cylinder
}

/// Split a cylindrical face along a circle intersection curve.
///
/// When a plane perpendicular to the cylinder axis intersects the cylinder,
/// the result is a circle at constant height. In the cylinder's UV space
/// `[0, 2π] × [v_min, v_max]`, this circle becomes a horizontal line at `v = h`.
///
/// This function splits the cylindrical face into two strips:
/// - Lower strip: `[0, 2π] × [v_min, h]`
/// - Upper strip: `[0, 2π] × [h, v_max]`
///
/// The split is performed by:
/// 1. Computing the intersection height `v_split` from the circle center
/// 2. Creating new 3D vertices at the intersection points (on the seam)
/// 3. Creating two new face loops that share the intersection edge
/// 4. Removing the original face and adding the two new sub-faces
pub fn split_cylindrical_face_by_circle(
    brep: &mut BRepSolid,
    face_id: FaceId,
    circle: &vcad_kernel_geom::Circle3d,
) -> SplitResult {
    let face = &brep.topology.faces[face_id];
    let surface_index = face.surface_index;
    let orientation = face.orientation;
    let _outer_loop = face.outer_loop;
    let surface = &brep.geometry.surfaces[surface_index];

    // Verify surface is a cylinder
    let cyl = match surface
        .as_any()
        .downcast_ref::<vcad_kernel_geom::CylinderSurface>()
    {
        Some(c) => c.clone(),
        None => {
            return SplitResult {
                sub_faces: vec![face_id],
            };
        }
    };

    // Compute the split height: v_split = projection of circle center onto cylinder axis
    // v = (circle.center - cyl.center) · axis
    let v_split = (circle.center - cyl.center).dot(cyl.axis.as_ref());

    // Get the current face's v bounds from its boundary vertices
    let loop_hes: Vec<_> = brep.topology.loop_half_edges(face.outer_loop).collect();
    if loop_hes.is_empty() {
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // For a cylinder lateral face, we typically have:
    // - 2 vertices (top and bottom seam points)
    // - 4 half-edges: bottom circle, seam up, top circle, seam down
    // The v coordinates of these vertices give us v_min and v_max
    let mut v_min = f64::INFINITY;
    let mut v_max = f64::NEG_INFINITY;

    for &he_id in &loop_hes {
        let v_id = brep.topology.half_edges[he_id].origin;
        let point = brep.topology.vertices[v_id].point;
        let v = (point - cyl.center).dot(cyl.axis.as_ref());
        v_min = v_min.min(v);
        v_max = v_max.max(v);
    }

    // Check if split height is within the face's v range
    if v_split <= v_min + 1e-9 || v_split >= v_max - 1e-9 {
        // Split line doesn't cross the face interior
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // Create new vertex at the seam point at height v_split
    // At u=0, the point is: center + radius * ref_dir + v_split * axis
    let seam_point_at_split =
        cyl.center + cyl.radius * cyl.ref_dir.as_ref() + v_split * cyl.axis.as_ref();
    let v_split_seam = brep.topology.add_vertex(seam_point_at_split);

    // Get the existing top and bottom seam vertices
    // For a standard cylinder lateral face:
    // - loop_hes[0] origin = bottom seam point (at v_min)
    // - loop_hes[2] origin = top seam point (at v_max)
    // But this depends on how the cylinder was constructed.
    // Let's identify vertices by their v coordinate.
    let mut v_bottom = None;
    let mut v_top = None;

    for &he_id in &loop_hes {
        let vid = brep.topology.half_edges[he_id].origin;
        let point = brep.topology.vertices[vid].point;
        let v = (point - cyl.center).dot(cyl.axis.as_ref());
        if (v - v_min).abs() < 1e-9 {
            v_bottom = Some(vid);
        }
        if (v - v_max).abs() < 1e-9 {
            v_top = Some(vid);
        }
    }

    let (v_bottom, v_top) = match (v_bottom, v_top) {
        (Some(b), Some(t)) => (b, t),
        _ => {
            return SplitResult {
                sub_faces: vec![face_id],
            };
        }
    };

    // Now create the two new sub-faces.
    // Each face has a similar structure to the original:
    // - A circular edge at one end
    // - A seam edge connecting to the split
    // - The split circle edge
    // - A seam edge back

    // For simplicity, we'll create new faces with the same topology structure
    // but different boundary vertices.

    // Lower face: v_min to v_split
    // Boundary: bottom_circle (v_bottom → v_bottom) → seam_up (v_bottom → v_split_seam)
    //        → split_circle (v_split_seam → v_split_seam) → seam_down (v_split_seam → v_bottom)
    let he_lower_bot = brep.topology.add_half_edge(v_bottom);
    let he_lower_seam_up = brep.topology.add_half_edge(v_bottom);
    let he_lower_split = brep.topology.add_half_edge(v_split_seam);
    let he_lower_seam_down = brep.topology.add_half_edge(v_split_seam);

    let lower_loop = brep.topology.add_loop(&[
        he_lower_bot,
        he_lower_seam_up,
        he_lower_split,
        he_lower_seam_down,
    ]);
    let lower_face = brep
        .topology
        .add_face(lower_loop, surface_index, orientation);

    // Upper face: v_split to v_max
    // Boundary: split_circle (v_split_seam → v_split_seam) → seam_up (v_split_seam → v_top)
    //        → top_circle (v_top → v_top) → seam_down (v_top → v_split_seam)
    let he_upper_split = brep.topology.add_half_edge(v_split_seam);
    let he_upper_seam_up = brep.topology.add_half_edge(v_split_seam);
    let he_upper_top = brep.topology.add_half_edge(v_top);
    let he_upper_seam_down = brep.topology.add_half_edge(v_top);

    let upper_loop = brep.topology.add_loop(&[
        he_upper_split,
        he_upper_seam_up,
        he_upper_top,
        he_upper_seam_down,
    ]);
    let upper_face = brep
        .topology
        .add_face(upper_loop, surface_index, orientation);

    // Add twin edges
    // Lower seam edges
    brep.topology.add_edge(he_lower_seam_up, he_lower_seam_down);
    // Upper seam edges
    brep.topology.add_edge(he_upper_seam_up, he_upper_seam_down);
    // The split circle edges from upper and lower faces are twins
    brep.topology.add_edge(he_lower_split, he_upper_split);

    // Link bottom circle: lower face shares with bottom cap
    // Link top circle: upper face shares with top cap
    // These would need to be re-linked if we had access to the original edges
    // For now, we'll skip re-linking circular edges as they're handled elsewhere

    // Add the new faces to the shell
    if let Some(shell_id) = brep.topology.faces[face_id].shell {
        brep.topology.shells[shell_id].faces.push(lower_face);
        brep.topology.shells[shell_id].faces.push(upper_face);

        brep.topology.faces[lower_face].shell = Some(shell_id);
        brep.topology.faces[upper_face].shell = Some(shell_id);

        // Remove original face from shell
        brep.topology.shells[shell_id]
            .faces
            .retain(|&f| f != face_id);
    }

    // Remove the original face
    brep.topology.faces.remove(face_id);

    // Add 3D curves for the split circle
    brep.geometry.add_curve_3d(Box::new(circle.clone()));

    SplitResult {
        sub_faces: vec![lower_face, upper_face],
    }
}

/// Split a cylindrical face along a line intersection curve.
///
/// When a plane parallel to the cylinder axis intersects the cylinder,
/// the result is a vertical line on the cylinder surface. In the cylinder's
/// UV space `[0, 2π] × [v_min, v_max]`, this line becomes a vertical line
/// at constant u = u_split.
///
/// This function splits the cylindrical face into two parts:
/// - One part: `[u_min, u_split] × [v_min, v_max]`
/// - Other part: `[u_split, u_max] × [v_min, v_max]`
///
/// For a full lateral face (u spans 0 to 2π), the split creates two partial
/// cylindrical faces that share the split edge.
pub fn split_cylindrical_face_by_line(
    brep: &mut BRepSolid,
    face_id: FaceId,
    line: &vcad_kernel_geom::Line3d,
) -> SplitResult {
    let face = &brep.topology.faces[face_id];
    let surface_index = face.surface_index;
    let orientation = face.orientation;
    let surface = &brep.geometry.surfaces[surface_index];

    // Verify surface is a cylinder
    let cyl = match surface
        .as_any()
        .downcast_ref::<vcad_kernel_geom::CylinderSurface>()
    {
        Some(c) => c.clone(),
        None => {
            return SplitResult {
                sub_faces: vec![face_id],
            };
        }
    };

    // The line must be on the cylinder surface. Find the U parameter where
    // the line intersects the cylinder.
    // A point on the line: line.origin + t * line.direction
    // For this to be on the cylinder: distance from axis = radius
    //
    // Use line.origin projected onto the cylinder to find U:
    // u = atan2(dot(p - center, y_dir), dot(p - center, ref_dir))
    let d = line.origin - cyl.center;
    let ref_dir = cyl.ref_dir.as_ref();
    let y_dir = cyl.axis.as_ref().cross(ref_dir);
    let u_split = d.dot(&y_dir).atan2(d.dot(ref_dir));
    let u_split = if u_split < 0.0 {
        u_split + 2.0 * std::f64::consts::PI
    } else {
        u_split
    };

    // Get the current face's vertex bounds
    let loop_hes: Vec<_> = brep.topology.loop_half_edges(face.outer_loop).collect();
    if loop_hes.is_empty() {
        return SplitResult {
            sub_faces: vec![face_id],
        };
    }

    // Get the v bounds (height along axis)
    let mut v_min = f64::INFINITY;
    let mut v_max = f64::NEG_INFINITY;
    for &he_id in &loop_hes {
        let v_id = brep.topology.half_edges[he_id].origin;
        let point = brep.topology.vertices[v_id].point;
        let v = (point - cyl.center).dot(cyl.axis.as_ref());
        v_min = v_min.min(v);
        v_max = v_max.max(v);
    }

    // Check that the split line is actually on/near the face
    // (the line's u coordinate should be in the face's u range)
    // For a full lateral face, u ranges from 0 to 2π
    // We'll assume a full lateral face for now
    let _face_u_min = 0.0;
    let _face_u_max = 2.0 * std::f64::consts::PI;

    // Compute 3D points at the split line's top and bottom
    let sin_u = u_split.sin();
    let cos_u = u_split.cos();
    let radial = cyl.radius * (cos_u * ref_dir + sin_u * y_dir);
    let point_bottom = cyl.center + radial + v_min * cyl.axis.as_ref();
    let point_top = cyl.center + radial + v_max * cyl.axis.as_ref();

    // Create vertices at the split points
    let v_split_bottom = brep.topology.add_vertex(point_bottom);
    let v_split_top = brep.topology.add_vertex(point_top);

    // Get the existing corner vertices
    // For a standard full cylinder lateral face:
    // The face has vertices at u=0 at top and bottom (the seam)
    let seam_bottom =
        cyl.center + cyl.radius * cyl.ref_dir.as_ref() + v_min * cyl.axis.as_ref();
    let seam_top = cyl.center + cyl.radius * cyl.ref_dir.as_ref() + v_max * cyl.axis.as_ref();

    // Find existing seam vertices by position
    let mut v_seam_bottom = None;
    let mut v_seam_top = None;
    for &he_id in &loop_hes {
        let vid = brep.topology.half_edges[he_id].origin;
        let point = brep.topology.vertices[vid].point;
        if (point - seam_bottom).norm() < 1e-6 {
            v_seam_bottom = Some(vid);
        }
        if (point - seam_top).norm() < 1e-6 {
            v_seam_top = Some(vid);
        }
    }

    let (v_seam_bottom, v_seam_top) = match (v_seam_bottom, v_seam_top) {
        (Some(b), Some(t)) => (b, t),
        _ => {
            // Can't find seam vertices - might be a partial face
            // For now, skip this case
            return SplitResult {
                sub_faces: vec![face_id],
            };
        }
    };

    // Create two new faces by splitting at the u_split line:
    // Face 1: u from 0 to u_split (seam to split line)
    // Face 2: u from u_split to 2π (split line back to seam)
    //
    // Each face has 4 vertices forming a quad on the cylinder surface:
    // Face 1: seam_bottom → split_bottom → split_top → seam_top → back to seam_bottom
    // Face 2: split_bottom → seam_bottom (going around) → seam_top → split_top → back

    // Face 1: smaller arc from seam to split
    let he1_bot = brep.topology.add_half_edge(v_seam_bottom);
    let he1_left = brep.topology.add_half_edge(v_split_bottom);
    let he1_top = brep.topology.add_half_edge(v_split_top);
    let he1_right = brep.topology.add_half_edge(v_seam_top);

    let loop1 = brep
        .topology
        .add_loop(&[he1_bot, he1_left, he1_top, he1_right]);
    let face1 = brep
        .topology
        .add_face(loop1, surface_index, orientation);

    // Face 2: larger arc from split back to seam
    let he2_bot = brep.topology.add_half_edge(v_split_bottom);
    let he2_left = brep.topology.add_half_edge(v_seam_bottom);
    let he2_top = brep.topology.add_half_edge(v_seam_top);
    let he2_right = brep.topology.add_half_edge(v_split_top);

    let loop2 = brep
        .topology
        .add_loop(&[he2_bot, he2_left, he2_top, he2_right]);
    let face2 = brep
        .topology
        .add_face(loop2, surface_index, orientation);

    // Add twin edges
    // The split line edges between face1 and face2
    brep.topology.add_edge(he1_left, he2_right);
    brep.topology.add_edge(he1_top, he2_bot);

    // Add faces to shell
    if let Some(shell_id) = brep.topology.faces[face_id].shell {
        brep.topology.shells[shell_id].faces.push(face1);
        brep.topology.shells[shell_id].faces.push(face2);

        brep.topology.faces[face1].shell = Some(shell_id);
        brep.topology.faces[face2].shell = Some(shell_id);

        // Remove original face from shell
        brep.topology.shells[shell_id]
            .faces
            .retain(|&f| f != face_id);
    }

    // Remove the original face
    brep.topology.faces.remove(face_id);

    // Add 3D curve for the split line
    brep.geometry.add_curve_3d(Box::new(line.clone()));

    SplitResult {
        sub_faces: vec![face1, face2],
    }
}

/// Split a cylindrical face along an intersection curve.
///
/// This dispatches to the appropriate split method based on the curve type:
/// - Circle: horizontal split (perpendicular plane intersection)
/// - Line: vertical split (parallel plane intersection)
/// - Sampled: general oblique split - TODO
pub fn split_cylindrical_face(
    brep: &mut BRepSolid,
    face_id: FaceId,
    curve: &IntersectionCurve,
) -> SplitResult {
    match curve {
        IntersectionCurve::Circle(circle) => {
            split_cylindrical_face_by_circle(brep, face_id, circle)
        }
        IntersectionCurve::Line(line) => {
            split_cylindrical_face_by_line(brep, face_id, line)
        }
        IntersectionCurve::Sampled(_points) => {
            // TODO: Implement general oblique split
            SplitResult {
                sub_faces: vec![face_id],
            }
        }
        IntersectionCurve::Empty | IntersectionCurve::Point(_) => SplitResult {
            sub_faces: vec![face_id],
        },
        IntersectionCurve::TwoLines(line1, _line2) => {
            // TwoLines should be expanded before calling this function.
            // If we get here, just process the first line.
            split_cylindrical_face(brep, face_id, &IntersectionCurve::Line(line1.clone()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_primitives::make_cube;

    #[test]
    fn test_find_closest_edge() {
        let square = vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(10.0, 0.0, 0.0),
            Point3::new(10.0, 10.0, 0.0),
            Point3::new(0.0, 10.0, 0.0),
        ];

        // Point on the bottom edge
        let edge = find_closest_edge(&square, &Point3::new(5.0, 0.0, 0.0));
        assert_eq!(edge, 0);

        // Point on the right edge
        let edge = find_closest_edge(&square, &Point3::new(10.0, 5.0, 0.0));
        assert_eq!(edge, 1);

        // Point on the top edge
        let edge = find_closest_edge(&square, &Point3::new(5.0, 10.0, 0.0));
        assert_eq!(edge, 2);

        // Point on the left edge
        let edge = find_closest_edge(&square, &Point3::new(0.0, 5.0, 0.0));
        assert_eq!(edge, 3);
    }

    #[test]
    fn test_point_to_segment_dist() {
        let a = Point3::new(0.0, 0.0, 0.0);
        let b = Point3::new(10.0, 0.0, 0.0);

        // Point on the segment
        assert!(point_to_segment_dist(&Point3::new(5.0, 0.0, 0.0), &a, &b) < 1e-10);

        // Point above the segment midpoint
        let dist = point_to_segment_dist(&Point3::new(5.0, 3.0, 0.0), &a, &b);
        assert!((dist - 3.0).abs() < 1e-10);

        // Point beyond endpoint
        let dist = point_to_segment_dist(&Point3::new(15.0, 0.0, 0.0), &a, &b);
        assert!((dist - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_split_face_cube() {
        let mut brep = make_cube(10.0, 10.0, 10.0);

        // Find the bottom face (z=0)
        let bottom_face = brep
            .topology
            .faces
            .iter()
            .find(|(fid, _)| {
                let verts: Vec<Point3> = brep
                    .topology
                    .loop_half_edges(brep.topology.faces[*fid].outer_loop)
                    .map(|he| brep.topology.vertices[brep.topology.half_edges[he].origin].point)
                    .collect();
                verts.iter().all(|v| v.z.abs() < 1e-10)
            })
            .map(|(fid, _)| fid);

        if let Some(face_id) = bottom_face {
            let initial_face_count = brep.topology.faces.len();

            // Split the bottom face with a line from (5,0,0) to (5,10,0)
            let entry = Point3::new(5.0, 0.0, 0.0);
            let exit = Point3::new(5.0, 10.0, 0.0);
            let curve = IntersectionCurve::Line(vcad_kernel_geom::Line3d {
                origin: entry,
                direction: exit - entry,
            });

            let result = split_face_by_curve(&mut brep, face_id, &curve, &entry, &exit);

            // Should produce 2 sub-faces
            assert_eq!(result.sub_faces.len(), 2);

            // Total faces should increase by 1 (original removed, 2 new added: +2 - 1 = +1)
            assert_eq!(brep.topology.faces.len(), initial_face_count + 1);
        }
    }
}
