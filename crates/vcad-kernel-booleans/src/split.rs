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

    // Check if circle center is inside the polygon (approximately)
    // Project to 2D in the face's plane and do point-in-polygon test
    if !circle_inside_polygon(&loop_verts, circle) {
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

/// Check if a circle is inside a polygon (in 3D, assumes coplanar).
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

    // Point-in-polygon test (ray casting)
    let mut inside = false;
    let n = poly_2d.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = poly_2d[i];
        let (xj, yj) = poly_2d[j];

        if ((yi > cy) != (yj > cy)) && (cx < (xj - xi) * (cy - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }

    // For a full check, we should also verify the circle doesn't cross the polygon boundary
    // For simplicity, we just check if center is inside with some margin
    // TODO: Could add circle-edge distance checks for robustness

    inside
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

/// Split a cylindrical face along an intersection curve.
///
/// This dispatches to the appropriate split method based on the curve type:
/// - Circle: horizontal split (perpendicular plane intersection)
/// - Line: vertical split (parallel plane intersection) - TODO
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
        IntersectionCurve::Line(_line) => {
            // TODO: Implement vertical line split for parallel plane intersection
            // For now, skip this case
            SplitResult {
                sub_faces: vec![face_id],
            }
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
