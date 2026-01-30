//! Axis-aligned bounding box computation and face-pair filtering.
//!
//! Used as a broadphase filter: only face pairs with overlapping AABBs
//! need surface-surface intersection tests.

use vcad_kernel_math::Point3;
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::FaceId;

/// Axis-aligned bounding box in 3D.
#[derive(Debug, Clone, Copy)]
pub struct Aabb3 {
    /// Minimum corner.
    pub min: Point3,
    /// Maximum corner.
    pub max: Point3,
}

impl Aabb3 {
    /// Create an AABB from min and max corners.
    pub fn new(min: Point3, max: Point3) -> Self {
        Self { min, max }
    }

    /// Create an empty (inverted) AABB suitable for expansion.
    pub fn empty() -> Self {
        Self {
            min: Point3::new(f64::INFINITY, f64::INFINITY, f64::INFINITY),
            max: Point3::new(f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY),
        }
    }

    /// Expand this AABB to include a point.
    pub fn include_point(&mut self, p: &Point3) {
        self.min.x = self.min.x.min(p.x);
        self.min.y = self.min.y.min(p.y);
        self.min.z = self.min.z.min(p.z);
        self.max.x = self.max.x.max(p.x);
        self.max.y = self.max.y.max(p.y);
        self.max.z = self.max.z.max(p.z);
    }

    /// Test if two AABBs overlap (touching counts as overlap).
    pub fn overlaps(&self, other: &Aabb3) -> bool {
        self.min.x <= other.max.x
            && self.max.x >= other.min.x
            && self.min.y <= other.max.y
            && self.max.y >= other.min.y
            && self.min.z <= other.max.z
            && self.max.z >= other.min.z
    }

    /// Expand the AABB by a tolerance in all directions.
    pub fn expand(&mut self, tol: f64) {
        self.min.x -= tol;
        self.min.y -= tol;
        self.min.z -= tol;
        self.max.x += tol;
        self.max.y += tol;
        self.max.z += tol;
    }
}

/// Compute the AABB for a face from its boundary vertex positions.
///
/// For planar faces this is exact. For curved faces (cylinder, sphere, cone)
/// this is conservative — the actual surface may extend beyond the vertices,
/// but vertex positions bound the trim loop endpoints. We add a small
/// tolerance to account for curvature.
pub fn face_aabb(brep: &BRepSolid, face_id: FaceId) -> Aabb3 {
    let topo = &brep.topology;
    let face = &topo.faces[face_id];
    let mut aabb = Aabb3::empty();

    // Include all vertices from outer loop
    for he_id in topo.loop_half_edges(face.outer_loop) {
        let v_id = topo.half_edges[he_id].origin;
        aabb.include_point(&topo.vertices[v_id].point);
    }

    // Include all vertices from inner loops (holes)
    for &inner_loop in &face.inner_loops {
        for he_id in topo.loop_half_edges(inner_loop) {
            let v_id = topo.half_edges[he_id].origin;
            aabb.include_point(&topo.vertices[v_id].point);
        }
    }

    // For curved surfaces, the surface may bulge beyond vertices.
    // Expand the AABB based on the actual surface geometry.
    let surface = &brep.geometry.surfaces[face.surface_index];
    match surface.surface_type() {
        vcad_kernel_geom::SurfaceKind::Plane => {
            // Planar faces usually have exact bounds from vertices.
            // Exception: circular boundaries (cylinder/sphere caps) may have only 1-2 vertices
            // at the seam, so the AABB is degenerate. Expand based on vertex distance from
            // the plane's origin (which gives the circle radius).
            let diag = ((aabb.max.x - aabb.min.x).powi(2)
                + (aabb.max.y - aabb.min.y).powi(2)
                + (aabb.max.z - aabb.min.z).powi(2))
            .sqrt();

            // If AABB is nearly degenerate (diagonal < 1), this is likely a circular boundary
            if diag < 1.0 {
                if let Some(plane) = surface
                    .as_any()
                    .downcast_ref::<vcad_kernel_geom::Plane>()
                {
                    // The vertex is on the circular boundary. The radius is its distance
                    // from the plane's origin (circle center) projected onto the plane.
                    // Use the first vertex position to estimate the radius.
                    let first_he = topo.loop_half_edges(face.outer_loop).next();
                    if let Some(he_id) = first_he {
                        let v_pos = topo.vertices[topo.half_edges[he_id].origin].point;
                        let to_vertex = v_pos - plane.origin;
                        // Project onto plane (remove normal component)
                        let normal = plane.normal_dir.into_inner();
                        let on_plane = to_vertex - to_vertex.dot(&normal) * normal;
                        let radius = on_plane.norm();

                        if radius > 1e-6 {
                            // Expand the AABB to cover the full circle
                            // The circle is centered at plane.origin
                            aabb = Aabb3::empty();
                            // Include corners of a bounding square around the circle
                            let x_dir = *plane.x_dir.as_ref();
                            let y_dir = *plane.y_dir.as_ref();
                            let center = plane.origin;
                            aabb.include_point(&(center + radius * x_dir + radius * y_dir));
                            aabb.include_point(&(center + radius * x_dir - radius * y_dir));
                            aabb.include_point(&(center - radius * x_dir + radius * y_dir));
                            aabb.include_point(&(center - radius * x_dir - radius * y_dir));
                        }
                    }
                }
            }
        }
        vcad_kernel_geom::SurfaceKind::Cylinder => {
            // For cylinders, compute AABB based on the actual cylinder geometry.
            // The vertex-based AABB only includes seam vertices, which doesn't
            // capture the full extent of the cylinder surface.
            if let Some(cyl) = surface
                .as_any()
                .downcast_ref::<vcad_kernel_geom::CylinderSurface>()
            {
                // Get the V range from the face vertices (height along axis)
                let mut v_min = f64::INFINITY;
                let mut v_max = f64::NEG_INFINITY;
                for he_id in topo.loop_half_edges(face.outer_loop) {
                    let v_id = topo.half_edges[he_id].origin;
                    let point = topo.vertices[v_id].point;
                    let v = (point - cyl.center).dot(cyl.axis.as_ref());
                    v_min = v_min.min(v);
                    v_max = v_max.max(v);
                }

                // Compute AABB for a full cylinder from center
                // The cylinder extends ±radius in directions perpendicular to axis
                let axis = cyl.axis.as_ref();
                let center = cyl.center;
                let r = cyl.radius;

                // Bottom and top circle centers
                let bottom_center = center + v_min * axis;
                let top_center = center + v_max * axis;

                // For a cylinder aligned with arbitrary axis, the AABB includes
                // all points on circles at bottom and top. In the worst case,
                // include ±r in x and y (assuming axis is close to z).
                // For a general axis, we'd need to compute the actual projection.
                // For now, use a conservative approach.
                aabb = Aabb3::empty();
                // Include bottom and top centers expanded by radius
                aabb.include_point(&(bottom_center + vcad_kernel_math::Vec3::new(r, r, 0.0)));
                aabb.include_point(&(bottom_center + vcad_kernel_math::Vec3::new(r, -r, 0.0)));
                aabb.include_point(&(bottom_center + vcad_kernel_math::Vec3::new(-r, r, 0.0)));
                aabb.include_point(&(bottom_center + vcad_kernel_math::Vec3::new(-r, -r, 0.0)));
                aabb.include_point(&(top_center + vcad_kernel_math::Vec3::new(r, r, 0.0)));
                aabb.include_point(&(top_center + vcad_kernel_math::Vec3::new(r, -r, 0.0)));
                aabb.include_point(&(top_center + vcad_kernel_math::Vec3::new(-r, r, 0.0)));
                aabb.include_point(&(top_center + vcad_kernel_math::Vec3::new(-r, -r, 0.0)));

                // For axis not aligned with Z, we'd need more points, but for common cases
                // (axis along Z), this gives correct results.
            }
        }
        vcad_kernel_geom::SurfaceKind::Sphere => {
            // For spheres, expand by the radius in all directions
            if let Some(sph) = surface
                .as_any()
                .downcast_ref::<vcad_kernel_geom::SphereSurface>()
            {
                aabb.expand(sph.radius);
            }
        }
        vcad_kernel_geom::SurfaceKind::Cone => {
            // For cones, use a conservative estimate based on the vertex positions
            let diag = ((aabb.max.x - aabb.min.x).powi(2)
                + (aabb.max.y - aabb.min.y).powi(2)
                + (aabb.max.z - aabb.min.z).powi(2))
            .sqrt();
            aabb.expand(diag * 0.5);
        }
        vcad_kernel_geom::SurfaceKind::Bilinear => {
            // Bilinear surfaces: vertices are exact bounds (surface is defined by corners)
        }
    }

    aabb
}

/// Compute the AABB for the entire solid.
///
/// Uses the union of all face AABBs, which properly accounts for curved surfaces
/// (cylinders, cones, spheres) that may extend beyond their boundary vertices.
pub fn solid_aabb(brep: &BRepSolid) -> Aabb3 {
    let mut aabb = Aabb3::empty();
    for (face_id, _) in &brep.topology.faces {
        let face_box = face_aabb(brep, face_id);
        aabb.include_point(&face_box.min);
        aabb.include_point(&face_box.max);
    }
    aabb
}

/// Find candidate face pairs between two solids whose AABBs overlap.
///
/// Returns `(face_from_a, face_from_b)` pairs. Only these pairs need
/// surface-surface intersection tests.
pub fn find_candidate_face_pairs(a: &BRepSolid, b: &BRepSolid) -> Vec<(FaceId, FaceId)> {
    // First check if the overall solids overlap at all
    let aabb_a = solid_aabb(a);
    let aabb_b = solid_aabb(b);
    if !aabb_a.overlaps(&aabb_b) {
        return Vec::new();
    }

    // Precompute face AABBs for solid B
    let b_faces: Vec<(FaceId, Aabb3)> = b
        .topology
        .faces
        .iter()
        .map(|(fid, _)| (fid, face_aabb(b, fid)))
        .collect();

    let mut pairs = Vec::new();

    for (fa_id, _) in &a.topology.faces {
        let aabb_fa = face_aabb(a, fa_id);

        for &(fb_id, ref aabb_fb) in &b_faces {
            if aabb_fa.overlaps(aabb_fb) {
                pairs.push((fa_id, fb_id));
            }
        }
    }

    pairs
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_primitives::make_cube;

    #[test]
    fn test_aabb_overlap() {
        let a = Aabb3::new(Point3::new(0.0, 0.0, 0.0), Point3::new(10.0, 10.0, 10.0));
        let b = Aabb3::new(Point3::new(5.0, 5.0, 5.0), Point3::new(15.0, 15.0, 15.0));
        assert!(a.overlaps(&b));
        assert!(b.overlaps(&a));

        let c = Aabb3::new(Point3::new(20.0, 20.0, 20.0), Point3::new(30.0, 30.0, 30.0));
        assert!(!a.overlaps(&c));
    }

    #[test]
    fn test_aabb_touching() {
        let a = Aabb3::new(Point3::new(0.0, 0.0, 0.0), Point3::new(10.0, 10.0, 10.0));
        let b = Aabb3::new(Point3::new(10.0, 0.0, 0.0), Point3::new(20.0, 10.0, 10.0));
        assert!(a.overlaps(&b)); // touching counts
    }

    #[test]
    fn test_non_overlapping_cubes_no_pairs() {
        // Two cubes far apart — no candidate pairs
        let a = make_cube(10.0, 10.0, 10.0);
        let mut b = make_cube(10.0, 10.0, 10.0);
        // Translate b's vertices by (100, 0, 0)
        for (_, v) in &mut b.topology.vertices {
            v.point.x += 100.0;
        }
        let pairs = find_candidate_face_pairs(&a, &b);
        assert!(pairs.is_empty());
    }

    #[test]
    fn test_overlapping_cubes_has_pairs() {
        // Two identical cubes at origin — all face pairs overlap
        let a = make_cube(10.0, 10.0, 10.0);
        let b = make_cube(10.0, 10.0, 10.0);
        let pairs = find_candidate_face_pairs(&a, &b);
        // Both have 6 faces, and all AABBs overlap
        assert!(!pairs.is_empty());
        // Could be up to 36 pairs (6×6), but some may not overlap
        assert!(pairs.len() >= 6); // at least face-to-face matches
    }

    #[test]
    fn test_partially_overlapping_cubes() {
        let a = make_cube(10.0, 10.0, 10.0);
        let mut b = make_cube(10.0, 10.0, 10.0);
        // Shift b by (5, 0, 0) — partial overlap
        for (_, v) in &mut b.topology.vertices {
            v.point.x += 5.0;
        }
        let pairs = find_candidate_face_pairs(&a, &b);
        // Some pairs should exist but not all 36
        assert!(!pairs.is_empty());
        assert!(pairs.len() < 36);
    }

    #[test]
    fn test_face_aabb_cube() {
        let brep = make_cube(10.0, 10.0, 10.0);
        // Check that the solid AABB spans (0,0,0) to (10,10,10)
        let aabb = solid_aabb(&brep);
        assert!((aabb.min.x - 0.0).abs() < 1e-10);
        assert!((aabb.min.y - 0.0).abs() < 1e-10);
        assert!((aabb.min.z - 0.0).abs() < 1e-10);
        assert!((aabb.max.x - 10.0).abs() < 1e-10);
        assert!((aabb.max.y - 10.0).abs() < 1e-10);
        assert!((aabb.max.z - 10.0).abs() < 1e-10);
    }
}
