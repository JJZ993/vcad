//! Surface-surface intersection (SSI) for analytic surfaces.
//!
//! Computes the intersection curve between two parametric surfaces.
//! For analytic surface pairs (Plane, Cylinder, Cone, Sphere), many
//! intersections have known closed-form solutions.

use vcad_kernel_geom::{
    Circle3d, CylinderSurface, Line3d, Plane, SphereSurface, Surface, SurfaceKind,
};
use vcad_kernel_math::{Dir3, Point3};

/// Result of a surface-surface intersection.
#[derive(Debug, Clone)]
pub enum IntersectionCurve {
    /// No intersection.
    Empty,
    /// Single point of tangency.
    Point(Point3),
    /// Line intersection (e.g. plane-plane).
    Line(Line3d),
    /// Two parallel line intersections (e.g. plane parallel to cylinder axis).
    TwoLines(Line3d, Line3d),
    /// Circle intersection (e.g. plane-sphere, sphere-sphere).
    Circle(Circle3d),
    /// Sampled polyline for complex intersections.
    Sampled(Vec<Point3>),
}

/// Compute the intersection of two surfaces.
///
/// Dispatches to specialized routines based on surface type.
pub fn intersect_surfaces(a: &dyn Surface, b: &dyn Surface) -> IntersectionCurve {
    match (a.surface_type(), b.surface_type()) {
        (SurfaceKind::Plane, SurfaceKind::Plane) => {
            let pa = downcast_plane(a);
            let pb = downcast_plane(b);
            match (pa, pb) {
                (Some(pa), Some(pb)) => plane_plane(pa, pb),
                _ => IntersectionCurve::Empty,
            }
        }
        (SurfaceKind::Plane, SurfaceKind::Sphere) => {
            let p = downcast_plane(a);
            let s = downcast_sphere(b);
            match (p, s) {
                (Some(p), Some(s)) => plane_sphere(p, s),
                _ => IntersectionCurve::Empty,
            }
        }
        (SurfaceKind::Sphere, SurfaceKind::Plane) => {
            let s = downcast_sphere(a);
            let p = downcast_plane(b);
            match (s, p) {
                (Some(s), Some(p)) => plane_sphere(p, s),
                _ => IntersectionCurve::Empty,
            }
        }
        (SurfaceKind::Plane, SurfaceKind::Cylinder) => {
            let p = downcast_plane(a);
            let c = downcast_cylinder(b);
            match (p, c) {
                (Some(p), Some(c)) => plane_cylinder(p, c),
                _ => IntersectionCurve::Empty,
            }
        }
        (SurfaceKind::Cylinder, SurfaceKind::Plane) => {
            let c = downcast_cylinder(a);
            let p = downcast_plane(b);
            match (c, p) {
                (Some(c), Some(p)) => plane_cylinder(p, c),
                _ => IntersectionCurve::Empty,
            }
        }
        (SurfaceKind::Sphere, SurfaceKind::Sphere) => {
            let sa = downcast_sphere(a);
            let sb = downcast_sphere(b);
            match (sa, sb) {
                (Some(sa), Some(sb)) => sphere_sphere(sa, sb),
                _ => IntersectionCurve::Empty,
            }
        }
        _ => {
            // Unsupported pair — return empty for now
            // TODO: marching method for general cases
            IntersectionCurve::Empty
        }
    }
}

// =============================================================================
// Downcasting helpers (safe via as_any())
// =============================================================================

fn downcast_plane(s: &dyn Surface) -> Option<&Plane> {
    s.as_any().downcast_ref::<Plane>()
}

fn downcast_sphere(s: &dyn Surface) -> Option<&SphereSurface> {
    s.as_any().downcast_ref::<SphereSurface>()
}

fn downcast_cylinder(s: &dyn Surface) -> Option<&CylinderSurface> {
    s.as_any().downcast_ref::<CylinderSurface>()
}

// =============================================================================
// Plane-Plane intersection
// =============================================================================

/// Intersection of two planes.
///
/// - Parallel + distinct → Empty
/// - Parallel + coincident → TODO: return coincident marker
/// - Non-parallel → Line along the cross product of normals
fn plane_plane(a: &Plane, b: &Plane) -> IntersectionCurve {
    let n1 = a.normal_dir;
    let n2 = b.normal_dir;

    // Direction of intersection line = n1 × n2
    let dir = n1.as_ref().cross(n2.as_ref());
    let dir_len = dir.norm();

    if dir_len < 1e-12 {
        // Planes are parallel
        let dist = a.signed_distance(&b.origin).abs();
        if dist < 1e-9 {
            // Coincident — treat as empty for boolean purposes
            // (coincident faces are handled in classification, not SSI)
            return IntersectionCurve::Empty;
        }
        return IntersectionCurve::Empty;
    }

    // Find a point on the intersection line.
    // Solve the system: n1 · p = d1, n2 · p = d2
    // We pick the point closest to the origin by solving in the plane
    // perpendicular to dir.
    let d1 = n1.as_ref().dot(&a.origin.coords);
    let d2 = n2.as_ref().dot(&b.origin.coords);

    let n1n1 = n1.as_ref().dot(n1.as_ref());
    let n1n2 = n1.as_ref().dot(n2.as_ref());
    let n2n2 = n2.as_ref().dot(n2.as_ref());

    let det = n1n1 * n2n2 - n1n2 * n1n2;
    if det.abs() < 1e-15 {
        return IntersectionCurve::Empty;
    }

    let c1 = (d1 * n2n2 - d2 * n1n2) / det;
    let c2 = (d2 * n1n1 - d1 * n1n2) / det;

    let origin = Point3::from(c1 * n1.into_inner() + c2 * n2.into_inner());

    IntersectionCurve::Line(Line3d {
        origin,
        direction: dir,
    })
}

// =============================================================================
// Plane-Sphere intersection
// =============================================================================

/// Intersection of a plane and a sphere.
///
/// - Distance > radius → Empty
/// - Distance = radius → Point (tangent)
/// - Distance < radius → Circle
fn plane_sphere(plane: &Plane, sphere: &SphereSurface) -> IntersectionCurve {
    let dist = plane.signed_distance(&sphere.center);
    let abs_dist = dist.abs();

    if abs_dist > sphere.radius + 1e-9 {
        return IntersectionCurve::Empty;
    }

    if (abs_dist - sphere.radius).abs() < 1e-9 {
        // Tangent — single point
        let point = sphere.center - dist * plane.normal_dir.into_inner();
        return IntersectionCurve::Point(point);
    }

    // Circle
    let circle_radius = (sphere.radius * sphere.radius - dist * dist).sqrt();
    let circle_center = sphere.center - dist * plane.normal_dir.into_inner();

    IntersectionCurve::Circle(Circle3d::with_normal(
        circle_center,
        circle_radius,
        *plane.normal_dir.as_ref(),
    ))
}

// =============================================================================
// Plane-Cylinder intersection
// =============================================================================

/// Intersection of a plane and a cylinder.
///
/// Three cases:
/// - Plane parallel to axis → 0, 1, or 2 lines
/// - Plane perpendicular to axis → Circle (or ellipse, but we approximate)
/// - General angle → Ellipse (we return sampled points)
fn plane_cylinder(plane: &Plane, cyl: &CylinderSurface) -> IntersectionCurve {
    let n = plane.normal_dir;
    let axis = cyl.axis;

    let cos_angle = n.as_ref().dot(axis.as_ref()).abs();

    if cos_angle < 1e-12 {
        // Plane is parallel to cylinder axis
        // Distance from cylinder axis to plane
        let axis_point = cyl.center;
        let dist = plane.signed_distance(&axis_point).abs();

        if dist > cyl.radius + 1e-9 {
            return IntersectionCurve::Empty;
        }

        if (dist - cyl.radius).abs() < 1e-9 {
            // Tangent — single line
            let closest =
                axis_point - plane.signed_distance(&axis_point) * plane.normal_dir.into_inner();
            return IntersectionCurve::Line(Line3d {
                origin: closest,
                direction: *axis.as_ref(),
            });
        }

        // Two parallel lines
        // Project axis onto plane, find the two points at distance=radius from axis
        let axis_on_plane =
            axis_point - plane.signed_distance(&axis_point) * plane.normal_dir.into_inner();

        // Handle the case where axis lies in the plane (dist ≈ 0)
        let offset = axis_on_plane - axis_point;
        let offset_len = offset.norm();

        // Find the direction perpendicular to both the plane normal and axis
        // This is the direction along which the intersection lines are offset from the axis
        let perp = if offset_len < 1e-12 {
            // Axis lies in plane - the perpendicular direction is axis × normal
            let perp = axis.as_ref().cross(plane.normal_dir.as_ref());
            if perp.norm() < 1e-12 {
                return IntersectionCurve::Empty;
            }
            perp.normalize()
        } else {
            // Normal case - perpendicular is the direction from axis to axis_on_plane
            // crossed with axis to get the tangent direction
            let offset_dir = offset / offset_len;
            offset_dir.cross(axis.as_ref()).normalize()
        };

        let lateral = (cyl.radius * cyl.radius - dist * dist).sqrt();

        let p1 = Point3::from(axis_on_plane.coords + lateral * perp);
        let p2 = Point3::from(axis_on_plane.coords - lateral * perp);

        // Return both lines
        IntersectionCurve::TwoLines(
            Line3d {
                origin: p1,
                direction: *axis.as_ref(),
            },
            Line3d {
                origin: p2,
                direction: *axis.as_ref(),
            },
        )
    } else if (cos_angle - 1.0).abs() < 1e-12 {
        // Plane is perpendicular to cylinder axis → Circle
        let dist_along_axis =
            (plane.origin - cyl.center).dot(axis.as_ref()) / axis.as_ref().dot(axis.as_ref());
        let circle_center = cyl.center + dist_along_axis * axis.as_ref();

        IntersectionCurve::Circle(Circle3d::with_normal(
            circle_center,
            cyl.radius,
            *n.as_ref(),
        ))
    } else {
        // General case — ellipse
        // Sample the intersection curve
        let n_samples = 64;
        let mut points = Vec::with_capacity(n_samples);

        for i in 0..n_samples {
            let angle = 2.0 * std::f64::consts::PI * i as f64 / n_samples as f64;
            let (sin_a, cos_a) = angle.sin_cos();
            let ref_dir = cyl.ref_dir;
            let y_dir = axis.as_ref().cross(ref_dir.as_ref());

            // Point on the cylinder surface at angle `a`, arbitrary height
            let radial = cyl.radius * (cos_a * ref_dir.into_inner() + sin_a * y_dir);
            let p_on_cyl_base = cyl.center + radial;

            // Find height where this radial line intersects the plane
            // P = p_on_cyl_base + t * axis
            // plane.normal · P = plane.normal · plane.origin
            let denom = n.as_ref().dot(axis.as_ref());
            if denom.abs() < 1e-15 {
                continue;
            }
            let t = (plane.origin - p_on_cyl_base).dot(n.as_ref()) / denom;
            let intersection_point = p_on_cyl_base + t * axis.into_inner();
            points.push(intersection_point);
        }

        if points.is_empty() {
            IntersectionCurve::Empty
        } else {
            IntersectionCurve::Sampled(points)
        }
    }
}

// =============================================================================
// Sphere-Sphere intersection
// =============================================================================

/// Intersection of two spheres.
///
/// - Distance > r1 + r2 → Empty (too far apart)
/// - Distance < |r1 - r2| → Empty (one inside other)
/// - Distance = r1 + r2 or |r1 - r2| → Point (tangent)
/// - Otherwise → Circle
fn sphere_sphere(a: &SphereSurface, b: &SphereSurface) -> IntersectionCurve {
    let ab = b.center - a.center;
    let d = ab.norm();

    if d < 1e-12 {
        // Concentric spheres
        if (a.radius - b.radius).abs() < 1e-9 {
            // Identical — coincident
            return IntersectionCurve::Empty;
        }
        return IntersectionCurve::Empty;
    }

    if d > a.radius + b.radius + 1e-9 {
        return IntersectionCurve::Empty; // too far apart
    }

    if d < (a.radius - b.radius).abs() - 1e-9 {
        return IntersectionCurve::Empty; // one inside other
    }

    // Check tangent cases
    if (d - a.radius - b.radius).abs() < 1e-9 {
        // External tangent
        let point = a.center + (a.radius / d) * ab;
        return IntersectionCurve::Point(point);
    }

    if (d - (a.radius - b.radius).abs()).abs() < 1e-9 {
        // Internal tangent
        let point = if a.radius > b.radius {
            a.center + (a.radius / d) * ab
        } else {
            a.center - (a.radius / d) * ab
        };
        return IntersectionCurve::Point(point);
    }

    // General case — circle
    // The intersection circle lies in a plane perpendicular to the line
    // connecting the centers. Its distance from center A is:
    // h = (d² + r1² - r2²) / (2d)
    let h = (d * d + a.radius * a.radius - b.radius * b.radius) / (2.0 * d);

    let circle_center = a.center + (h / d) * ab;
    let circle_radius = (a.radius * a.radius - h * h).max(0.0).sqrt();
    let normal = Dir3::new_normalize(ab);

    IntersectionCurve::Circle(Circle3d::with_normal(
        circle_center,
        circle_radius,
        *normal.as_ref(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_math::Vec3;

    #[test]
    fn test_plane_plane_perpendicular() {
        let xy = Plane::xy();
        let xz = Plane::xz();

        let result = plane_plane(&xy, &xz);
        match result {
            IntersectionCurve::Line(line) => {
                // Intersection of XY and XZ planes is the X axis
                // The direction should be along X (cross of Z and Y normals)
                assert!(line.direction.x.abs() > 0.5);
                assert!(line.direction.y.abs() < 1e-10);
                assert!(line.direction.z.abs() < 1e-10);
            }
            _ => panic!("Expected Line intersection"),
        }
    }

    #[test]
    fn test_plane_plane_parallel() {
        let a = Plane::xy();
        let b = Plane::new(Point3::new(0.0, 0.0, 5.0), Vec3::x(), Vec3::y());

        let result = plane_plane(&a, &b);
        assert!(matches!(result, IntersectionCurve::Empty));
    }

    #[test]
    fn test_plane_sphere_through_center() {
        let plane = Plane::xy();
        let sphere = SphereSurface::new(10.0); // centered at origin

        let result = plane_sphere(&plane, &sphere);
        match result {
            IntersectionCurve::Circle(circle) => {
                assert!((circle.radius - 10.0).abs() < 1e-10);
                assert!(circle.center.z.abs() < 1e-10);
            }
            _ => panic!("Expected Circle intersection"),
        }
    }

    #[test]
    fn test_plane_sphere_tangent() {
        let plane = Plane::new(Point3::new(0.0, 0.0, 10.0), Vec3::x(), Vec3::y());
        let sphere = SphereSurface::new(10.0);

        let result = plane_sphere(&plane, &sphere);
        match result {
            IntersectionCurve::Point(p) => {
                assert!((p.z - 10.0).abs() < 1e-9);
            }
            _ => panic!("Expected Point tangency, got {:?}", result),
        }
    }

    #[test]
    fn test_plane_sphere_no_intersection() {
        let plane = Plane::new(Point3::new(0.0, 0.0, 15.0), Vec3::x(), Vec3::y());
        let sphere = SphereSurface::new(10.0);

        let result = plane_sphere(&plane, &sphere);
        assert!(matches!(result, IntersectionCurve::Empty));
    }

    #[test]
    fn test_sphere_sphere_intersect() {
        let a = SphereSurface::new(10.0); // at origin
        let b = SphereSurface::with_center(Point3::new(15.0, 0.0, 0.0), 10.0);

        let result = sphere_sphere(&a, &b);
        match result {
            IntersectionCurve::Circle(circle) => {
                // Circle should be between the two centers
                assert!(circle.center.x > 0.0 && circle.center.x < 15.0);
                assert!(circle.radius > 0.0);
            }
            _ => panic!("Expected Circle intersection"),
        }
    }

    #[test]
    fn test_sphere_sphere_too_far() {
        let a = SphereSurface::new(5.0);
        let b = SphereSurface::with_center(Point3::new(100.0, 0.0, 0.0), 5.0);

        let result = sphere_sphere(&a, &b);
        assert!(matches!(result, IntersectionCurve::Empty));
    }

    #[test]
    fn test_sphere_sphere_tangent() {
        let a = SphereSurface::new(5.0);
        let b = SphereSurface::with_center(Point3::new(10.0, 0.0, 0.0), 5.0);

        let result = sphere_sphere(&a, &b);
        match result {
            IntersectionCurve::Point(p) => {
                assert!((p.x - 5.0).abs() < 1e-9);
            }
            _ => panic!("Expected Point tangency"),
        }
    }

    #[test]
    fn test_plane_cylinder_perpendicular() {
        // Plane perpendicular to Z axis, cylinder along Z
        let plane = Plane::new(Point3::new(0.0, 0.0, 5.0), Vec3::x(), Vec3::y());
        let cyl = CylinderSurface::new(10.0);

        let result = plane_cylinder(&plane, &cyl);
        match result {
            IntersectionCurve::Circle(circle) => {
                assert!((circle.radius - 10.0).abs() < 1e-10);
                assert!((circle.center.z - 5.0).abs() < 1e-10);
            }
            _ => panic!("Expected Circle intersection, got {:?}", result),
        }
    }

    #[test]
    fn test_intersect_surfaces_dispatch() {
        let a: Box<dyn Surface> = Box::new(Plane::xy());
        let b: Box<dyn Surface> = Box::new(SphereSurface::new(10.0));

        let result = intersect_surfaces(a.as_ref(), b.as_ref());
        assert!(matches!(result, IntersectionCurve::Circle(_)));
    }
}
