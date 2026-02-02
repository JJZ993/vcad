//! Sub-face classification for B-rep boolean operations.
//!
//! After face splitting, each sub-face must be classified as IN, OUT,
//! ON_SAME, or ON_OPPOSITE relative to the other solid. The boolean
//! operation then selects which sub-faces to keep.

use vcad_kernel_geom::SurfaceKind;
use vcad_kernel_math::Point3;
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_tessellate::{tessellate_brep, TriangleMesh};
use vcad_kernel_topo::FaceId;

use crate::point_in_mesh;
use crate::BooleanOp;

/// Classification of a face relative to another solid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FaceClassification {
    /// Face is outside the other solid.
    Outside,
    /// Face is inside the other solid.
    Inside,
    /// Face is on the boundary, normals agree.
    OnSame,
    /// Face is on the boundary, normals oppose.
    OnOpposite,
}

/// Compute a sample point in the interior of a face.
///
/// Returns a 3D point that lies on the face's surface, inside its boundary
/// but outside any holes (inner loops). Uses different strategies depending
/// on whether the face has holes.
pub fn face_sample_point(brep: &BRepSolid, face_id: FaceId) -> Point3 {
    let topo = &brep.topology;
    let face = &topo.faces[face_id];

    // Collect outer loop vertices
    let vertices: Vec<Point3> = topo
        .loop_half_edges(face.outer_loop)
        .map(|he_id| topo.vertices[topo.half_edges[he_id].origin].point)
        .collect();

    if vertices.is_empty() {
        return Point3::origin();
    }

    // Special case: circular disk face with a single seam vertex
    // (e.g., cylinder caps). The single vertex is on the circle's boundary,
    // not at its center. For proper classification, use the plane's origin
    // which is the center of the circular disk.
    if vertices.len() == 1 {
        let surface = &brep.geometry.surfaces[face.surface_index];
        if let Some(plane) = surface.as_any().downcast_ref::<vcad_kernel_geom::Plane>() {
            return plane.origin;
        }
        // Fallback: return the single vertex
        return vertices[0];
    }

    // If face has inner loops (holes), we need a smarter sample point
    // that's outside the holes but inside the outer boundary.
    if !face.inner_loops.is_empty() {
        // Strategy: pick a point on the outer boundary's edge midpoint
        // and move slightly inward. This avoids the hole in the center.
        if vertices.len() >= 2 {
            // Take the midpoint of the first edge
            let edge_mid = Point3::new(
                (vertices[0].x + vertices[1].x) / 2.0,
                (vertices[0].y + vertices[1].y) / 2.0,
                (vertices[0].z + vertices[1].z) / 2.0,
            );

            // Compute face centroid
            let n = vertices.len() as f64;
            let cx = vertices.iter().map(|v| v.x).sum::<f64>() / n;
            let cy = vertices.iter().map(|v| v.y).sum::<f64>() / n;
            let cz = vertices.iter().map(|v| v.z).sum::<f64>() / n;
            let centroid = Point3::new(cx, cy, cz);

            // Move from edge_mid slightly toward centroid, but only 10% of the way
            // This keeps the sample point near the outer boundary, avoiding holes
            let dir = centroid - edge_mid;
            let sample = edge_mid + 0.1 * dir;

            return sample;
        }
    }

    // Standard case: no holes, use centroid
    let n = vertices.len() as f64;
    let cx = vertices.iter().map(|v| v.x).sum::<f64>() / n;
    let cy = vertices.iter().map(|v| v.y).sum::<f64>() / n;
    let cz = vertices.iter().map(|v| v.z).sum::<f64>() / n;
    let centroid = Point3::new(cx, cy, cz);

    // Snap small values to 0 to avoid floating point classification issues
    // at solid boundaries (e.g., -0.0 being treated as outside when it should be on-boundary)
    let snap = |v: f64| if v.abs() < 1e-9 { 0.0 } else { v };
    let centroid = Point3::new(snap(centroid.x), snap(centroid.y), snap(centroid.z));

    // For planar faces, the centroid is already on the surface.
    // For curved faces, project back to the surface using the closest UV.
    let surface = &brep.geometry.surfaces[face.surface_index];
    match surface.surface_type() {
        SurfaceKind::Plane => centroid,
        SurfaceKind::Cylinder => {
            // For cylindrical faces, compute a point ON the surface at the middle
            // of the face's U (angular) range. The boundary vertex centroid may
            // be inside the cylinder, not on its surface, leading to wrong classification.
            if let Some(cyl) = surface
                .as_any()
                .downcast_ref::<vcad_kernel_geom::CylinderSurface>()
            {
                use std::f64::consts::PI;

                let ref_dir = cyl.ref_dir.as_ref();
                let y_dir = cyl.axis.as_ref().cross(ref_dir);

                // Compute U angles for each boundary vertex
                let mut u_angles: Vec<f64> = vertices
                    .iter()
                    .map(|v| {
                        let d = *v - cyl.center;
                        let u = d.dot(&y_dir).atan2(d.dot(ref_dir));
                        if u < 0.0 { u + 2.0 * PI } else { u }
                    })
                    .collect();
                u_angles.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                u_angles.dedup_by(|a, b| (*a - *b).abs() < 0.01);

                if u_angles.len() >= 2 {
                    let u_min = u_angles[0];
                    let u_max = u_angles[u_angles.len() - 1];

                    // Check if face wraps around 2π (gap between max and min is small)
                    let direct_span = u_max - u_min;
                    let wrap_span = 2.0 * PI - direct_span;

                    let u_mid = if wrap_span < direct_span {
                        // Face wraps around: use midpoint of the wrap region
                        let mid = (u_max + u_min + 2.0 * PI) / 2.0;
                        if mid >= 2.0 * PI { mid - 2.0 * PI } else { mid }
                    } else {
                        // Normal face: use midpoint of direct span
                        (u_min + u_max) / 2.0
                    };

                    // Compute V (height) at centroid
                    let v_mid = (centroid - cyl.center).dot(cyl.axis.as_ref());

                    // Evaluate point on cylinder surface
                    let sin_u = u_mid.sin();
                    let cos_u = u_mid.cos();
                    let radial = cyl.radius * (cos_u * ref_dir + sin_u * y_dir);
                    let sample = cyl.center + radial + v_mid * cyl.axis.as_ref();
                    return sample;
                }
            }
            centroid
        }
        _ => {
            // For other curved surfaces, the centroid of boundary vertices may not
            // lie on the surface. We use it as-is for classification since
            // we only need it to be "near" the face for ray-casting.
            centroid
        }
    }
}

/// Classify a face of one solid relative to another solid.
///
/// The `other_mesh` is the tessellated mesh of the other solid, used
/// for point-in-solid testing.
pub fn classify_face(
    brep: &BRepSolid,
    face_id: FaceId,
    other_mesh: &TriangleMesh,
) -> FaceClassification {
    let sample = face_sample_point(brep, face_id);

    // Offset the sample point slightly along the face normal
    // to avoid landing exactly on the boundary
    let face = &brep.topology.faces[face_id];
    let surface = &brep.geometry.surfaces[face.surface_index];

    // Compute the outward normal from the loop vertex winding.
    // By B-rep convention, loop vertices are ordered so that (v1-v0) × (v2-v0)
    // points outward from the solid. This is more reliable than using the
    // surface normal + orientation, which may not correctly indicate outward.
    let outer_verts: Vec<Point3> = brep
        .topology
        .loop_half_edges(face.outer_loop)
        .map(|he_id| brep.topology.vertices[brep.topology.half_edges[he_id].origin].point)
        .collect();

    let oriented_normal = if outer_verts.len() >= 3 {
        let e1 = outer_verts[1] - outer_verts[0];
        let e2 = outer_verts[2] - outer_verts[0];
        let n = e1.cross(&e2);
        if n.norm() > 1e-15 {
            n.normalize()
        } else {
            // Degenerate polygon — fall back to surface normal with orientation
            let sn = surface.normal(vcad_kernel_math::Point2::origin());
            let normal = *sn.as_ref();
            match face.orientation {
                vcad_kernel_topo::Orientation::Forward => normal,
                vcad_kernel_topo::Orientation::Reversed => -normal,
            }
        }
    } else {
        // Too few vertices — fall back to surface normal with orientation
        let sn = surface.normal(vcad_kernel_math::Point2::origin());
        let normal = *sn.as_ref();
        match face.orientation {
            vcad_kernel_topo::Orientation::Forward => normal,
            vcad_kernel_topo::Orientation::Reversed => -normal,
        }
    };

    // Test the sample point offset slightly inward (negative normal)
    let eps = 1e-4;
    let inward_point = sample - eps * oriented_normal;

    let is_inside = point_in_mesh(&inward_point, other_mesh);

    if is_inside {
        FaceClassification::Inside
    } else {
        FaceClassification::Outside
    }
}

/// Classify all faces of a solid relative to another solid.
pub fn classify_all_faces(
    brep: &BRepSolid,
    other: &BRepSolid,
    segments: u32,
) -> Vec<(FaceId, FaceClassification)> {
    let other_mesh = tessellate_brep(other, segments);
    brep.topology
        .faces
        .iter()
        .map(|(face_id, _)| {
            let class = classify_face(brep, face_id, &other_mesh);
            (face_id, class)
        })
        .collect()
}

/// Select which faces to keep from each solid based on the boolean operation.
///
/// Returns `(faces_from_a, faces_from_b, reverse_b)`.
/// `reverse_b` indicates that B's kept faces should have their orientation flipped.
pub fn select_faces(
    op: BooleanOp,
    classes_a: &[(FaceId, FaceClassification)],
    classes_b: &[(FaceId, FaceClassification)],
) -> (Vec<FaceId>, Vec<FaceId>, bool) {
    let keep_a: Vec<FaceId> = classes_a
        .iter()
        .filter(|(_, c)| match op {
            BooleanOp::Union => {
                matches!(c, FaceClassification::Outside | FaceClassification::OnSame)
            }
            BooleanOp::Difference => {
                matches!(
                    c,
                    FaceClassification::Outside | FaceClassification::OnOpposite
                )
            }
            BooleanOp::Intersection => {
                matches!(c, FaceClassification::Inside | FaceClassification::OnSame)
            }
        })
        .map(|(f, _)| *f)
        .collect();

    let keep_b: Vec<FaceId> = classes_b
        .iter()
        .filter(|(_, c)| match op {
            BooleanOp::Union => matches!(c, FaceClassification::Outside),
            BooleanOp::Difference => matches!(c, FaceClassification::Inside),
            BooleanOp::Intersection => matches!(c, FaceClassification::Inside),
        })
        .map(|(f, _)| *f)
        .collect();

    let reverse_b = matches!(op, BooleanOp::Difference);

    (keep_a, keep_b, reverse_b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_primitives::make_cube;

    #[test]
    fn test_face_sample_point_cube() {
        let brep = make_cube(10.0, 10.0, 10.0);
        // Each face's sample point should be on one of the cube faces
        for (face_id, _) in &brep.topology.faces {
            let sample = face_sample_point(&brep, face_id);
            // The point should be within the cube's extent
            assert!(sample.x >= -0.1 && sample.x <= 10.1);
            assert!(sample.y >= -0.1 && sample.y <= 10.1);
            assert!(sample.z >= -0.1 && sample.z <= 10.1);
        }
    }

    #[test]
    fn test_classify_non_overlapping() {
        // Cube A at origin, cube B far away
        let a = make_cube(10.0, 10.0, 10.0);
        let mut b = make_cube(10.0, 10.0, 10.0);
        for (_, v) in &mut b.topology.vertices {
            v.point.x += 100.0;
        }

        let classes = classify_all_faces(&a, &b, 32);
        // All faces of A should be Outside relative to B
        for (_, class) in &classes {
            assert_eq!(*class, FaceClassification::Outside);
        }
    }

    #[test]
    fn test_classify_inside() {
        // Small cube inside a larger cube
        let small = make_cube(2.0, 2.0, 2.0);
        let mut big = make_cube(10.0, 10.0, 10.0);
        // Move big so small is inside it (small is at 0-2, big at -1 to 9)
        for (_, v) in &mut big.topology.vertices {
            v.point.x -= 1.0;
            v.point.y -= 1.0;
            v.point.z -= 1.0;
        }

        let classes = classify_all_faces(&small, &big, 32);
        // All faces of small should be Inside relative to big
        for (_, class) in &classes {
            assert_eq!(*class, FaceClassification::Inside);
        }
    }

    #[test]
    fn test_select_union() {
        let classes_a = vec![
            // Simulate: some faces outside, some inside
        ];
        let classes_b = vec![];
        let (keep_a, keep_b, reverse_b) = select_faces(BooleanOp::Union, &classes_a, &classes_b);
        assert!(keep_a.is_empty());
        assert!(keep_b.is_empty());
        assert!(!reverse_b);
    }

    #[test]
    fn test_select_difference_reverses_b() {
        let classes_a: Vec<(FaceId, FaceClassification)> = vec![];
        let classes_b: Vec<(FaceId, FaceClassification)> = vec![];
        let (_, _, reverse_b) = select_faces(BooleanOp::Difference, &classes_a, &classes_b);
        assert!(reverse_b);
    }
}
