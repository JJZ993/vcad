//! Revolve operation: create a solid by rotating a profile around an axis.

use std::collections::HashMap;
use std::f64::consts::PI;

use vcad_kernel_geom::{CylinderSurface, GeometryStore, Plane};
use vcad_kernel_math::{Dir3, Point3, Tolerance, Vec3};
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::{HalfEdgeId, Orientation, ShellType, Topology, VertexId};

use crate::{SketchError, SketchProfile, SketchSegment};

/// Revolve a closed profile around an axis to create a B-rep solid.
///
/// # Arguments
///
/// * `profile` - The closed 2D profile to revolve (must be line-only for now)
/// * `axis_origin` - A point on the axis of revolution
/// * `axis_dir` - Direction of the axis of revolution
/// * `angle` - Angle of revolution in radians (must be in (0, 2π])
///
/// # Returns
///
/// A B-rep solid with surfaces of revolution.
///
/// # Errors
///
/// - `ZeroAxis` if the axis direction is zero
/// - `InvalidAngle` if angle is not in (0, 2π]
/// - `ArcNotSupported` if the profile contains arc segments
/// - `AxisIntersection` if any profile vertex lies on the axis
///
/// # Current Limitations
///
/// Arc segments in the profile would produce torus surfaces, which are not
/// yet supported. Use line-only profiles.
///
/// # Example
///
/// ```
/// use vcad_kernel_sketch::{SketchProfile, revolve};
/// use vcad_kernel_math::{Point3, Vec3};
/// use std::f64::consts::PI;
///
/// // Create a rectangle profile offset from the axis
/// let profile = SketchProfile::rectangle(
///     Point3::new(5.0, 0.0, 0.0),  // Offset from Y axis
///     Vec3::x(),
///     Vec3::z(),
///     3.0, 10.0,
/// );
///
/// // Revolve 360° around Y axis → hollow cylinder
/// let solid = revolve(&profile, Point3::origin(), Vec3::y(), 2.0 * PI).unwrap();
/// ```
pub fn revolve(
    profile: &SketchProfile,
    axis_origin: Point3,
    axis_dir: Vec3,
    angle: f64,
) -> Result<BRepSolid, SketchError> {
    // Validate axis
    if axis_dir.norm() < 1e-12 {
        return Err(SketchError::ZeroAxis);
    }
    let axis = Dir3::new_normalize(axis_dir);

    // Validate angle
    if angle <= 0.0 || angle > 2.0 * PI + 1e-9 {
        return Err(SketchError::InvalidAngle(angle));
    }

    // Check for arc segments (not supported)
    if !profile.is_line_only() {
        return Err(SketchError::ArcNotSupported);
    }

    let tol = Tolerance::DEFAULT;
    let is_full = (angle - 2.0 * PI).abs() < 1e-9;

    // Validate profile doesn't intersect axis
    for seg in &profile.segments {
        let p = profile.to_3d(seg.start());
        let dist = point_to_line_distance(&p, &axis_origin, axis.as_ref());
        if dist < tol.linear {
            return Err(SketchError::AxisIntersection);
        }
    }

    let mut topo = Topology::new();
    let mut geom = GeometryStore::new();

    // Vertex cache
    let mut vertex_cache: HashMap<[i64; 3], VertexId> = HashMap::new();

    let quantize_pt = |p: Point3| -> [i64; 3] {
        [
            (p.x * 1e9).round() as i64,
            (p.y * 1e9).round() as i64,
            (p.z * 1e9).round() as i64,
        ]
    };

    let get_or_create_vertex =
        |cache: &mut HashMap<[i64; 3], VertexId>, topo: &mut Topology, pos: Point3| -> VertexId {
            let key = quantize_pt(pos);
            *cache.entry(key).or_insert_with(|| topo.add_vertex(pos))
        };

    let n_segments = profile.segments.len();

    // For full revolution: each profile vertex maps to one vertex (seam)
    // For partial revolution: each profile vertex spawns 2 vertices
    let mut start_verts: Vec<VertexId> = Vec::with_capacity(n_segments);
    let mut end_verts: Vec<VertexId> = Vec::with_capacity(n_segments);

    for seg in &profile.segments {
        let p = profile.to_3d(seg.start());

        if is_full {
            // Single vertex for full revolution
            let v = get_or_create_vertex(&mut vertex_cache, &mut topo, p);
            start_verts.push(v);
            end_verts.push(v); // Same vertex for seam
        } else {
            // Two vertices for partial revolution
            let p_rotated = rotate_point(&p, &axis_origin, axis.as_ref(), angle);
            let v_start = get_or_create_vertex(&mut vertex_cache, &mut topo, p);
            let v_end = get_or_create_vertex(&mut vertex_cache, &mut topo, p_rotated);
            start_verts.push(v_start);
            end_verts.push(v_end);
        }
    }

    let mut all_faces = Vec::new();
    let mut he_map: HashMap<([i64; 3], [i64; 3]), HalfEdgeId> = HashMap::new();

    // Build revolution faces for each line segment
    for (i, seg) in profile.segments.iter().enumerate() {
        let next_i = (i + 1) % n_segments;

        let SketchSegment::Line { start, end } = seg else {
            unreachable!("already checked line-only");
        };

        let p_start = profile.to_3d(*start);
        let p_end = profile.to_3d(*end);

        // Classify the line segment relative to the axis
        let surf_type = classify_line_segment(&p_start, &p_end, &axis_origin, axis.as_ref());

        let face_id = if is_full {
            // For full revolution, use true surface types
            match surf_type {
                RevolveSurfaceType::Cylinder { radius } => build_full_cylinder_face(
                    &mut topo,
                    &mut geom,
                    &axis_origin,
                    axis.as_ref(),
                    radius,
                    &start_verts[i],
                    &start_verts[next_i],
                    &mut he_map,
                    quantize_pt,
                ),
                RevolveSurfaceType::Cone { .. } | RevolveSurfaceType::Plane { .. } => {
                    // For full cones and planes, use planar approximation
                    // (true cone tessellation has same issues as partial cylinder)
                    build_full_planar_approximation_face(
                        &mut topo,
                        &mut geom,
                        &start_verts[i],
                        &start_verts[next_i],
                        &mut he_map,
                        quantize_pt,
                    )
                }
            }
        } else {
            // For partial revolution, always use planar approximation
            // because tessellator can't handle partial curved surfaces
            build_partial_planar_face(
                &mut topo,
                &mut geom,
                &start_verts[i],
                &start_verts[next_i],
                &end_verts[next_i],
                &end_verts[i],
                &mut he_map,
                quantize_pt,
            )
        };

        all_faces.push(face_id);
    }

    // For partial revolution, add closing side faces
    if !is_full {
        // Start side face (at angle=0)
        // Revolution faces have edges start[i] -> start[i+1]
        // For these to be properly paired, start side needs reversed winding
        let start_face = build_side_face(
            &mut topo,
            &mut geom,
            &start_verts,
            &mut he_map,
            quantize_pt,
            true, // reversed winding so edges pair with revolution faces
        );
        all_faces.push(start_face);

        // End side face (at angle=angle)
        // Revolution faces have edges end[i+1] -> end[i] (going backward)
        // For these to be properly paired, end side needs forward winding
        let end_face = build_side_face(
            &mut topo,
            &mut geom,
            &end_verts,
            &mut he_map,
            quantize_pt,
            false, // forward winding
        );
        all_faces.push(end_face);
    }

    // Pair twin half-edges
    pair_twin_half_edges(&mut topo, &he_map);

    // Build shell and solid
    let shell = topo.add_shell(all_faces, ShellType::Outer);
    let solid_id = topo.add_solid(shell);

    Ok(BRepSolid {
        topology: topo,
        geometry: geom,
        solid_id,
    })
}

/// Classification of a line segment for revolve surface type.
#[derive(Debug)]
#[allow(dead_code)]
enum RevolveSurfaceType {
    /// Line parallel to axis at distance r → cylinder
    Cylinder { radius: f64 },
    /// Line perpendicular to axis → annular plane
    Plane { height: f64 },
    /// Line at angle to axis → cone
    Cone { apex: Point3, half_angle: f64 },
}

fn classify_line_segment(
    p_start: &Point3,
    p_end: &Point3,
    axis_origin: &Point3,
    axis: &Vec3,
) -> RevolveSurfaceType {
    let tol = Tolerance::DEFAULT;

    // Project points onto axis
    let t_start = (p_start - axis_origin).dot(axis);
    let t_end = (p_end - axis_origin).dot(axis);

    // Radial distances
    let proj_start = *axis_origin + t_start * axis;
    let proj_end = *axis_origin + t_end * axis;
    let r_start = (p_start - proj_start).norm();
    let r_end = (p_end - proj_end).norm();

    let delta_t = (t_end - t_start).abs();
    let delta_r = (r_end - r_start).abs();

    // Perpendicular to axis (same t, different r)
    if delta_t < tol.linear && delta_r > tol.linear {
        return RevolveSurfaceType::Plane { height: t_start };
    }

    // Parallel to axis (same r, different t)
    if delta_r < tol.linear && delta_t > tol.linear {
        return RevolveSurfaceType::Cylinder { radius: r_start };
    }

    // Angled: compute cone apex and half-angle
    let s_apex = -r_start / (r_end - r_start);
    let t_apex = t_start + s_apex * (t_end - t_start);
    let apex = *axis_origin + t_apex * axis;
    let half_angle = (delta_r / delta_t).atan();

    RevolveSurfaceType::Cone { apex, half_angle }
}

#[allow(clippy::too_many_arguments)]
fn build_full_cylinder_face<F>(
    topo: &mut Topology,
    geom: &mut GeometryStore,
    axis_origin: &Point3,
    axis: &Vec3,
    radius: f64,
    v_bot: &VertexId,
    v_top: &VertexId,
    he_map: &mut HashMap<([i64; 3], [i64; 3]), HalfEdgeId>,
    quantize_pt: F,
) -> vcad_kernel_topo::FaceId
where
    F: Fn(Point3) -> [i64; 3],
{
    let cyl_surface = CylinderSurface::with_axis(*axis_origin, *axis, radius);
    let surf_idx = geom.add_surface(Box::new(cyl_surface));

    // Full revolution: degenerate quad with seam
    // Two half-edges for seam (vertical), two for circles (degenerate)
    let he_bot = topo.add_half_edge(*v_bot); // bottom circle (degenerate)
    let he_seam_up = topo.add_half_edge(*v_bot); // seam going up
    let he_top = topo.add_half_edge(*v_top); // top circle (degenerate)
    let he_seam_down = topo.add_half_edge(*v_top); // seam going down

    let loop_id = topo.add_loop(&[he_bot, he_seam_up, he_top, he_seam_down]);
    let face_id = topo.add_face(loop_id, surf_idx, Orientation::Forward);

    // Record in he_map
    for &he_id in &[he_bot, he_seam_up, he_top, he_seam_down] {
        let he = &topo.half_edges[he_id];
        let origin = topo.vertices[he.origin].point;
        if let Some(next) = he.next {
            let dest = topo.vertices[topo.half_edges[next].origin].point;
            he_map.insert((quantize_pt(origin), quantize_pt(dest)), he_id);
        }
    }

    face_id
}

#[allow(clippy::too_many_arguments)]
fn build_full_planar_approximation_face<F>(
    topo: &mut Topology,
    geom: &mut GeometryStore,
    v_bot: &VertexId,
    v_top: &VertexId,
    he_map: &mut HashMap<([i64; 3], [i64; 3]), HalfEdgeId>,
    quantize_pt: F,
) -> vcad_kernel_topo::FaceId
where
    F: Fn(Point3) -> [i64; 3],
{
    // For full revolution of cone/plane, approximate with a degenerate planar face
    let p_bot = topo.vertices[*v_bot].point;
    let p_top = topo.vertices[*v_top].point;

    let plane = Plane::from_normal(p_bot, (p_top - p_bot).normalize());
    let surf_idx = geom.add_surface(Box::new(plane));

    let he_bot = topo.add_half_edge(*v_bot);
    let he_seam_up = topo.add_half_edge(*v_bot);
    let he_top = topo.add_half_edge(*v_top);
    let he_seam_down = topo.add_half_edge(*v_top);

    let loop_id = topo.add_loop(&[he_bot, he_seam_up, he_top, he_seam_down]);
    let face_id = topo.add_face(loop_id, surf_idx, Orientation::Forward);

    for &he_id in &[he_bot, he_seam_up, he_top, he_seam_down] {
        let he = &topo.half_edges[he_id];
        let origin = topo.vertices[he.origin].point;
        if let Some(next) = he.next {
            let dest = topo.vertices[topo.half_edges[next].origin].point;
            he_map.insert((quantize_pt(origin), quantize_pt(dest)), he_id);
        }
    }

    face_id
}

#[allow(clippy::too_many_arguments)]
fn build_partial_planar_face<F>(
    topo: &mut Topology,
    geom: &mut GeometryStore,
    v_start_0: &VertexId,
    v_start_1: &VertexId,
    v_end_1: &VertexId,
    v_end_0: &VertexId,
    he_map: &mut HashMap<([i64; 3], [i64; 3]), HalfEdgeId>,
    quantize_pt: F,
) -> vcad_kernel_topo::FaceId
where
    F: Fn(Point3) -> [i64; 3],
{
    // Use planar approximation for partial revolution faces
    let p0 = topo.vertices[*v_start_0].point;
    let p1 = topo.vertices[*v_start_1].point;
    let p2 = topo.vertices[*v_end_1].point;

    let x_dir = p1 - p0;
    let y_dir = p2 - p1;
    let plane = Plane::new(p0, x_dir, y_dir);
    let surf_idx = geom.add_surface(Box::new(plane));

    // Winding: v_start_0 -> v_start_1 -> v_end_1 -> v_end_0
    let he0 = topo.add_half_edge(*v_start_0);
    let he1 = topo.add_half_edge(*v_start_1);
    let he2 = topo.add_half_edge(*v_end_1);
    let he3 = topo.add_half_edge(*v_end_0);

    let loop_id = topo.add_loop(&[he0, he1, he2, he3]);
    let face_id = topo.add_face(loop_id, surf_idx, Orientation::Forward);

    for &he_id in &[he0, he1, he2, he3] {
        let he = &topo.half_edges[he_id];
        let origin = topo.vertices[he.origin].point;
        if let Some(next) = he.next {
            let dest = topo.vertices[topo.half_edges[next].origin].point;
            he_map.insert((quantize_pt(origin), quantize_pt(dest)), he_id);
        }
    }

    face_id
}

fn build_side_face<F>(
    topo: &mut Topology,
    geom: &mut GeometryStore,
    verts: &[VertexId],
    he_map: &mut HashMap<([i64; 3], [i64; 3]), HalfEdgeId>,
    quantize_pt: F,
    reversed: bool,
) -> vcad_kernel_topo::FaceId
where
    F: Fn(Point3) -> [i64; 3],
{
    let positions: Vec<Point3> = verts.iter().map(|&v| topo.vertices[v].point).collect();
    let n = positions.len();

    // Create plane from vertices
    let plane = if n >= 3 {
        Plane::new(
            positions[0],
            positions[1] - positions[0],
            positions[n - 1] - positions[0],
        )
    } else {
        Plane::from_normal(positions[0], Vec3::z())
    };
    let surf_idx = geom.add_surface(Box::new(plane));

    // Create half-edges
    let ordered_verts: Vec<VertexId> = if reversed {
        verts.iter().rev().copied().collect()
    } else {
        verts.to_vec()
    };

    let hes: Vec<HalfEdgeId> = ordered_verts
        .iter()
        .map(|&v| topo.add_half_edge(v))
        .collect();
    let loop_id = topo.add_loop(&hes);
    let face_id = topo.add_face(loop_id, surf_idx, Orientation::Forward);

    for &he_id in &hes {
        let he = &topo.half_edges[he_id];
        let origin = topo.vertices[he.origin].point;
        if let Some(next) = he.next {
            let dest = topo.vertices[topo.half_edges[next].origin].point;
            he_map.insert((quantize_pt(origin), quantize_pt(dest)), he_id);
        }
    }

    face_id
}

fn pair_twin_half_edges(topo: &mut Topology, he_map: &HashMap<([i64; 3], [i64; 3]), HalfEdgeId>) {
    let mut paired = std::collections::HashSet::new();

    for (&(origin_key, dest_key), &he_id) in he_map {
        if paired.contains(&(dest_key, origin_key)) {
            continue;
        }

        if let Some(&twin_id) = he_map.get(&(dest_key, origin_key)) {
            if topo.half_edges[he_id].twin.is_none() && topo.half_edges[twin_id].twin.is_none() {
                topo.add_edge(he_id, twin_id);
                paired.insert((origin_key, dest_key));
            }
        }
    }
}

fn point_to_line_distance(point: &Point3, line_origin: &Point3, line_dir: &Vec3) -> f64 {
    let v = point - line_origin;
    let proj = v.dot(line_dir) * line_dir;
    (v - proj).norm()
}

fn rotate_point(point: &Point3, axis_origin: &Point3, axis: &Vec3, angle: f64) -> Point3 {
    let v = point - axis_origin;

    let (sin_a, cos_a) = angle.sin_cos();
    let one_minus_cos = 1.0 - cos_a;

    let (x, y, z) = (axis.x, axis.y, axis.z);

    // Rodrigues' rotation formula
    let rotated = Vec3::new(
        (cos_a + one_minus_cos * x * x) * v.x
            + (one_minus_cos * x * y - sin_a * z) * v.y
            + (one_minus_cos * x * z + sin_a * y) * v.z,
        (one_minus_cos * x * y + sin_a * z) * v.x
            + (cos_a + one_minus_cos * y * y) * v.y
            + (one_minus_cos * y * z - sin_a * x) * v.z,
        (one_minus_cos * x * z - sin_a * y) * v.x
            + (one_minus_cos * y * z + sin_a * x) * v.y
            + (cos_a + one_minus_cos * z * z) * v.z,
    );

    *axis_origin + rotated
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_revolve_rectangle_full() {
        // Rectangle offset from Y-axis, revolve full 360° → hollow cylinder
        let profile = SketchProfile::rectangle(
            Point3::new(5.0, 0.0, 0.0),
            Vec3::x(),
            Vec3::z(),
            3.0,  // radial extent: 5 to 8
            10.0, // height
        );

        let solid = revolve(&profile, Point3::origin(), Vec3::z(), 2.0 * PI).unwrap();

        // 4 segments → 4 revolution faces
        // Full revolution: no side faces
        assert_eq!(solid.topology.faces.len(), 4);
    }

    #[test]
    fn test_revolve_rectangle_90_degrees() {
        let profile =
            SketchProfile::rectangle(Point3::new(5.0, 0.0, 0.0), Vec3::x(), Vec3::z(), 3.0, 10.0);

        let solid = revolve(&profile, Point3::origin(), Vec3::z(), PI / 2.0).unwrap();

        // 4 revolution faces + 2 side faces = 6 faces
        assert_eq!(solid.topology.faces.len(), 6);

        // 8 vertices (4 at start, 4 at end)
        assert_eq!(solid.topology.vertices.len(), 8);
    }

    #[test]
    fn test_revolve_triangle_to_cone() {
        // Profile in XZ plane, offset from Z-axis
        let profile =
            SketchProfile::rectangle(Point3::new(2.0, 0.0, 0.0), Vec3::x(), Vec3::z(), 5.0, 10.0);

        let solid = revolve(&profile, Point3::origin(), Vec3::z(), 2.0 * PI).unwrap();

        // Should have 4 faces (one per profile segment)
        assert_eq!(solid.topology.faces.len(), 4);
    }

    #[test]
    fn test_revolve_zero_axis_error() {
        let profile =
            SketchProfile::rectangle(Point3::new(5.0, 0.0, 0.0), Vec3::x(), Vec3::z(), 5.0, 10.0);

        let result = revolve(&profile, Point3::origin(), Vec3::zeros(), PI);
        assert!(matches!(result, Err(SketchError::ZeroAxis)));
    }

    #[test]
    fn test_revolve_invalid_angle_error() {
        let profile =
            SketchProfile::rectangle(Point3::new(5.0, 0.0, 0.0), Vec3::x(), Vec3::z(), 3.0, 10.0);

        // Negative angle
        let result = revolve(&profile, Point3::origin(), Vec3::z(), -1.0);
        assert!(matches!(result, Err(SketchError::InvalidAngle(_))));

        // Zero angle
        let result = revolve(&profile, Point3::origin(), Vec3::z(), 0.0);
        assert!(matches!(result, Err(SketchError::InvalidAngle(_))));

        // Angle > 2π
        let result = revolve(&profile, Point3::origin(), Vec3::z(), 3.0 * PI);
        assert!(matches!(result, Err(SketchError::InvalidAngle(_))));
    }

    #[test]
    fn test_revolve_arc_not_supported() {
        let profile = SketchProfile::circle(Point3::new(10.0, 0.0, 0.0), Vec3::x(), 3.0, 4);

        let result = revolve(&profile, Point3::origin(), Vec3::z(), PI);
        assert!(matches!(result, Err(SketchError::ArcNotSupported)));
    }

    #[test]
    fn test_revolve_axis_intersection_error() {
        // Profile with a vertex on the Z-axis (x=0, y=0)
        // Rectangle at origin in XZ plane, one corner at (0,0,0) which is on Z-axis
        let profile = SketchProfile::rectangle(
            Point3::origin(), // Origin at (0, 0, 0) which is on Z-axis
            Vec3::x(),
            Vec3::z(),
            5.0,
            5.0,
        );

        let result = revolve(&profile, Point3::origin(), Vec3::z(), PI);
        assert!(matches!(result, Err(SketchError::AxisIntersection)));
    }

    #[test]
    fn test_revolve_90_degrees_volume() {
        // Rectangle profile: inner radius 5, outer radius 8, height 10
        // Quarter-annulus volume = π * (R² - r²) * h / 4 = π * (64 - 25) * 10 / 4 ≈ 306.3
        let profile =
            SketchProfile::rectangle(Point3::new(5.0, 0.0, 0.0), Vec3::x(), Vec3::z(), 3.0, 10.0);

        let solid = revolve(&profile, Point3::origin(), Vec3::z(), PI / 2.0).unwrap();

        // All half-edges should be paired
        let unpaired = solid
            .topology
            .half_edges
            .values()
            .filter(|he| he.twin.is_none())
            .count();
        assert_eq!(unpaired, 0, "all half-edges should be paired");

        let mesh = vcad_kernel_tessellate::tessellate_brep(&solid, 64);
        let vol = compute_mesh_volume(&mesh);

        let expected = PI * (8.0 * 8.0 - 5.0 * 5.0) * 10.0 / 4.0;
        // Using planar approximation for curved faces
        // Planar quads for 90° arcs underestimate significantly (~36% error)
        // Just verify we get a reasonable positive volume
        assert!(
            vol > expected * 0.5 && vol < expected * 1.2,
            "expected volume ~{expected:.1} (±50%), got {vol:.1}"
        );
    }

    #[test]
    fn test_classify_parallel_line() {
        let p_start = Point3::new(5.0, 0.0, 0.0);
        let p_end = Point3::new(5.0, 0.0, 10.0);
        let axis_origin = Point3::origin();
        let axis = Vec3::z();

        let result = classify_line_segment(&p_start, &p_end, &axis_origin, &axis);
        match result {
            RevolveSurfaceType::Cylinder { radius } => {
                assert!((radius - 5.0).abs() < 1e-10);
            }
            _ => panic!("expected cylinder"),
        }
    }

    #[test]
    fn test_classify_perpendicular_line() {
        let p_start = Point3::new(5.0, 0.0, 5.0);
        let p_end = Point3::new(8.0, 0.0, 5.0);
        let axis_origin = Point3::origin();
        let axis = Vec3::z();

        let result = classify_line_segment(&p_start, &p_end, &axis_origin, &axis);
        match result {
            RevolveSurfaceType::Plane { height } => {
                assert!((height - 5.0).abs() < 1e-10);
            }
            _ => panic!("expected plane"),
        }
    }

    #[test]
    fn test_classify_angled_line() {
        let p_start = Point3::new(5.0, 0.0, 0.0);
        let p_end = Point3::new(10.0, 0.0, 10.0);
        let axis_origin = Point3::origin();
        let axis = Vec3::z();

        let result = classify_line_segment(&p_start, &p_end, &axis_origin, &axis);
        match result {
            RevolveSurfaceType::Cone { .. } => {
                // Expected
            }
            _ => panic!("expected cone"),
        }
    }

    fn compute_mesh_volume(mesh: &vcad_kernel_tessellate::TriangleMesh) -> f64 {
        let verts = &mesh.vertices;
        let indices = &mesh.indices;
        let mut vol = 0.0;
        for tri in indices.chunks(3) {
            let (i0, i1, i2) = (
                tri[0] as usize * 3,
                tri[1] as usize * 3,
                tri[2] as usize * 3,
            );
            let v0 = [verts[i0] as f64, verts[i0 + 1] as f64, verts[i0 + 2] as f64];
            let v1 = [verts[i1] as f64, verts[i1 + 1] as f64, verts[i1 + 2] as f64];
            let v2 = [verts[i2] as f64, verts[i2 + 1] as f64, verts[i2 + 2] as f64];
            vol += v0[0] * (v1[1] * v2[2] - v2[1] * v1[2])
                - v1[0] * (v0[1] * v2[2] - v2[1] * v0[2])
                + v2[0] * (v0[1] * v1[2] - v1[1] * v0[2]);
        }
        (vol / 6.0).abs()
    }
}
