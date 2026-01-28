#![warn(missing_docs)]

//! Math types for the vcad B-rep kernel.
//!
//! Thin wrappers around nalgebra providing domain-specific types
//! for 3D CAD geometry: points, vectors, directions, transforms,
//! and tolerance constants.

use nalgebra::{Matrix4, Unit, Vector2, Vector3, Vector4};

/// A point in 3D space.
pub type Point3 = nalgebra::Point3<f64>;

/// A vector in 3D space.
pub type Vec3 = Vector3<f64>;

/// A unit (normalized) direction vector in 3D space.
pub type Dir3 = Unit<Vector3<f64>>;

/// A point in 2D parameter space.
pub type Point2 = nalgebra::Point2<f64>;

/// A vector in 2D space.
pub type Vec2 = Vector2<f64>;

/// A 4x4 affine transformation matrix.
#[derive(Debug, Clone, PartialEq)]
pub struct Transform {
    /// The underlying 4x4 matrix.
    pub matrix: Matrix4<f64>,
}

impl Transform {
    /// Identity transform.
    pub fn identity() -> Self {
        Self {
            matrix: Matrix4::identity(),
        }
    }

    /// Translation by `(dx, dy, dz)`.
    pub fn translation(dx: f64, dy: f64, dz: f64) -> Self {
        let mut m = Matrix4::identity();
        m[(0, 3)] = dx;
        m[(1, 3)] = dy;
        m[(2, 3)] = dz;
        Self { matrix: m }
    }

    /// Non-uniform scale by `(sx, sy, sz)`.
    pub fn scale(sx: f64, sy: f64, sz: f64) -> Self {
        let mut m = Matrix4::identity();
        m[(0, 0)] = sx;
        m[(1, 1)] = sy;
        m[(2, 2)] = sz;
        Self { matrix: m }
    }

    /// Rotation about the X axis by `angle` radians.
    pub fn rotation_x(angle: f64) -> Self {
        let (s, c) = angle.sin_cos();
        let mut m = Matrix4::identity();
        m[(1, 1)] = c;
        m[(1, 2)] = -s;
        m[(2, 1)] = s;
        m[(2, 2)] = c;
        Self { matrix: m }
    }

    /// Rotation about the Y axis by `angle` radians.
    pub fn rotation_y(angle: f64) -> Self {
        let (s, c) = angle.sin_cos();
        let mut m = Matrix4::identity();
        m[(0, 0)] = c;
        m[(0, 2)] = s;
        m[(2, 0)] = -s;
        m[(2, 2)] = c;
        Self { matrix: m }
    }

    /// Rotation about the Z axis by `angle` radians.
    pub fn rotation_z(angle: f64) -> Self {
        let (s, c) = angle.sin_cos();
        let mut m = Matrix4::identity();
        m[(0, 0)] = c;
        m[(0, 1)] = -s;
        m[(1, 0)] = s;
        m[(1, 1)] = c;
        Self { matrix: m }
    }

    /// Rotation about an arbitrary axis through the origin by `angle` radians.
    ///
    /// Uses Rodrigues' rotation formula.
    pub fn rotation_about_axis(axis: &Dir3, angle: f64) -> Self {
        let (s, c) = angle.sin_cos();
        let t = 1.0 - c;
        let (x, y, z) = (axis.as_ref().x, axis.as_ref().y, axis.as_ref().z);
        let mut m = Matrix4::identity();
        m[(0, 0)] = t * x * x + c;
        m[(0, 1)] = t * x * y - s * z;
        m[(0, 2)] = t * x * z + s * y;
        m[(1, 0)] = t * x * y + s * z;
        m[(1, 1)] = t * y * y + c;
        m[(1, 2)] = t * y * z - s * x;
        m[(2, 0)] = t * x * z - s * y;
        m[(2, 1)] = t * y * z + s * x;
        m[(2, 2)] = t * z * z + c;
        Self { matrix: m }
    }

    /// Compose: `self` then `other` (self * other).
    pub fn then(&self, other: &Transform) -> Self {
        Self {
            matrix: self.matrix * other.matrix,
        }
    }

    /// Transform a point.
    pub fn apply_point(&self, p: &Point3) -> Point3 {
        let v = self.matrix * Vector4::new(p.x, p.y, p.z, 1.0);
        Point3::new(v.x, v.y, v.z)
    }

    /// Transform a direction vector (ignores translation, applies rotation/scale).
    pub fn apply_vec(&self, v: &Vec3) -> Vec3 {
        let r = self.matrix * Vector4::new(v.x, v.y, v.z, 0.0);
        Vec3::new(r.x, r.y, r.z)
    }

    /// Transform a normal vector (uses inverse transpose of upper-left 3x3).
    pub fn apply_normal(&self, n: &Vec3) -> Vec3 {
        let m3 = self.matrix.fixed_view::<3, 3>(0, 0);
        if let Some(inv) = m3.try_inverse() {
            inv.transpose() * n
        } else {
            // Degenerate transform — return input unchanged
            *n
        }
    }

    /// Inverse of this transform, if it exists.
    pub fn inverse(&self) -> Option<Self> {
        self.matrix.try_inverse().map(|matrix| Self { matrix })
    }
}

impl Default for Transform {
    fn default() -> Self {
        Self::identity()
    }
}

/// Tolerance constants for geometric comparisons.
#[derive(Debug, Clone, Copy)]
pub struct Tolerance {
    /// Linear distance tolerance in mm.
    pub linear: f64,
    /// Angular tolerance in radians.
    pub angular: f64,
}

impl Tolerance {
    /// Default CAD tolerances (1e-6 mm linear, 1e-9 rad angular).
    pub const DEFAULT: Self = Self {
        linear: 1e-6,
        angular: 1e-9,
    };

    /// Check if two points are coincident within tolerance.
    pub fn points_equal(&self, a: &Point3, b: &Point3) -> bool {
        (a - b).norm() < self.linear
    }

    /// Check if a scalar distance is effectively zero.
    pub fn is_zero(&self, d: f64) -> bool {
        d.abs() < self.linear
    }

    /// Check if two angles are effectively equal (in radians).
    pub fn angles_equal(&self, a: f64, b: f64) -> bool {
        (a - b).abs() < self.angular
    }
}

impl Default for Tolerance {
    fn default() -> Self {
        Self::DEFAULT
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_identity_transform() {
        let t = Transform::identity();
        let p = Point3::new(1.0, 2.0, 3.0);
        let result = t.apply_point(&p);
        assert!((result - p).norm() < 1e-12);
    }

    #[test]
    fn test_translation() {
        let t = Transform::translation(10.0, 20.0, 30.0);
        let p = Point3::new(1.0, 2.0, 3.0);
        let result = t.apply_point(&p);
        assert!((result.x - 11.0).abs() < 1e-12);
        assert!((result.y - 22.0).abs() < 1e-12);
        assert!((result.z - 33.0).abs() < 1e-12);
    }

    #[test]
    fn test_rotation_z_90() {
        let t = Transform::rotation_z(PI / 2.0);
        let p = Point3::new(1.0, 0.0, 0.0);
        let result = t.apply_point(&p);
        assert!(result.x.abs() < 1e-12);
        assert!((result.y - 1.0).abs() < 1e-12);
    }

    #[test]
    fn test_scale() {
        let t = Transform::scale(2.0, 3.0, 4.0);
        let p = Point3::new(1.0, 1.0, 1.0);
        let result = t.apply_point(&p);
        assert!((result.x - 2.0).abs() < 1e-12);
        assert!((result.y - 3.0).abs() < 1e-12);
        assert!((result.z - 4.0).abs() < 1e-12);
    }

    #[test]
    fn test_compose() {
        let t1 = Transform::translation(1.0, 0.0, 0.0);
        let t2 = Transform::scale(2.0, 2.0, 2.0);
        // translate first, then scale: point (0,0,0) -> (1,0,0) -> (2,0,0)
        let composed = t2.then(&t1);
        // t2 * t1 means apply t1 first, then t2
        // Actually: composed.apply = t2(t1(p))
        // Wait — then() is self * other, so composed = scale * translate
        // apply(p) = scale(translate(p))
        // But our then semantics: self.then(other) = self * other
        // So t2.then(t1) = t2 * t1 — which applies t1 first
        // Actually that's wrong. Matrix multiplication: (A*B)*x = A*(B*x)
        // So t2.then(&t1).apply(p) = t2.matrix * t1.matrix * p = t2(t1(p))
        // No wait — then is self.matrix * other.matrix
        // So t2.then(&t1) has matrix = t2 * t1, and applying to p: (t2*t1)*p = t2*(t1*p)
        // So it's: first apply t1, then t2. That is: translate then scale.
        let p = Point3::origin();
        let result = composed.apply_point(&p);
        assert!((result.x - 2.0).abs() < 1e-12);
    }

    #[test]
    fn test_inverse() {
        let t = Transform::translation(1.0, 2.0, 3.0);
        let inv = t.inverse().unwrap();
        let composed = t.then(&inv);
        let p = Point3::new(5.0, 6.0, 7.0);
        let result = composed.apply_point(&p);
        assert!((result - p).norm() < 1e-12);
    }

    #[test]
    fn test_rotation_about_axis() {
        // Rotate (1,0,0) by 90° about Z axis → (0,1,0)
        let axis = Dir3::new_normalize(Vec3::z());
        let t = Transform::rotation_about_axis(&axis, PI / 2.0);
        let p = Point3::new(1.0, 0.0, 0.0);
        let result = t.apply_point(&p);
        assert!(result.x.abs() < 1e-12);
        assert!((result.y - 1.0).abs() < 1e-12);
        assert!(result.z.abs() < 1e-12);

        // Rotate about (1,1,0) normalized by 180° — should swap x/y and negate z
        let axis2 = Dir3::new_normalize(Vec3::new(1.0, 1.0, 0.0));
        let t2 = Transform::rotation_about_axis(&axis2, PI);
        let p2 = Point3::new(1.0, 0.0, 0.0);
        let r2 = t2.apply_point(&p2);
        assert!((r2.x - 0.0).abs() < 1e-12);
        assert!((r2.y - 1.0).abs() < 1e-12);
        assert!(r2.z.abs() < 1e-12);
    }

    #[test]
    fn test_tolerance_points_equal() {
        let tol = Tolerance::DEFAULT;
        let a = Point3::new(1.0, 2.0, 3.0);
        let b = Point3::new(1.0 + 1e-7, 2.0, 3.0);
        assert!(tol.points_equal(&a, &b));
        let c = Point3::new(1.001, 2.0, 3.0);
        assert!(!tol.points_equal(&a, &c));
    }
}
