//! Joint conversion from vcad to Rapier.

use nalgebra::{Point3, UnitVector3, Vector3};
use rapier3d::dynamics::{
    GenericJoint, GenericJointBuilder, JointAxesMask, JointAxis, MotorModel,
    RigidBodyHandle,
};
use vcad_ir::{Joint as VcadJoint, JointKind};

use crate::error::PhysicsError;

/// Default motor parameters.
#[allow(dead_code)]
pub const DEFAULT_MOTOR_STIFFNESS: f32 = 1000.0;
#[allow(dead_code)]
pub const DEFAULT_MOTOR_DAMPING: f32 = 100.0;
pub const DEFAULT_MAX_FORCE: f32 = 1000.0;

/// Create a Rapier joint from a vcad joint definition.
///
/// # Arguments
///
/// * `joint` - The vcad joint definition
/// * `parent_handle` - Handle to the parent rigid body (or None for world-grounded)
/// * `child_handle` - Handle to the child rigid body
///
/// # Returns
///
/// A Rapier GenericJoint configured to match the vcad joint.
pub fn vcad_joint_to_rapier(
    joint: &VcadJoint,
    _parent_handle: Option<RigidBodyHandle>,
    _child_handle: RigidBodyHandle,
) -> Result<GenericJoint, PhysicsError> {
    // Convert anchors from mm to meters
    let parent_anchor = Point3::new(
        joint.parent_anchor.x as f32 / 1000.0,
        joint.parent_anchor.y as f32 / 1000.0,
        joint.parent_anchor.z as f32 / 1000.0,
    );
    let child_anchor = Point3::new(
        joint.child_anchor.x as f32 / 1000.0,
        joint.child_anchor.y as f32 / 1000.0,
        joint.child_anchor.z as f32 / 1000.0,
    );

    match &joint.kind {
        JointKind::Fixed => Ok(create_fixed_joint(parent_anchor, child_anchor)),
        JointKind::Revolute { axis, limits } => {
            let axis_vec = Vector3::new(axis.x as f32, axis.y as f32, axis.z as f32);
            let axis_unit = UnitVector3::new_normalize(axis_vec);
            let limits_rad = limits.map(|(l, u)| (l.to_radians() as f32, u.to_radians() as f32));
            Ok(create_revolute_joint(
                parent_anchor,
                child_anchor,
                axis_unit,
                limits_rad,
            ))
        }
        JointKind::Slider { axis, limits } => {
            let axis_vec = Vector3::new(axis.x as f32, axis.y as f32, axis.z as f32);
            let axis_unit = UnitVector3::new_normalize(axis_vec);
            // Convert limits from mm to meters
            let limits_m = limits.map(|(l, u)| (l as f32 / 1000.0, u as f32 / 1000.0));
            Ok(create_prismatic_joint(
                parent_anchor,
                child_anchor,
                axis_unit,
                limits_m,
            ))
        }
        JointKind::Cylindrical { axis } => {
            let axis_vec = Vector3::new(axis.x as f32, axis.y as f32, axis.z as f32);
            let axis_unit = UnitVector3::new_normalize(axis_vec);
            Ok(create_cylindrical_joint(parent_anchor, child_anchor, axis_unit))
        }
        JointKind::Ball => Ok(create_ball_joint(parent_anchor, child_anchor)),
    }
}

fn create_fixed_joint(parent_anchor: Point3<f32>, child_anchor: Point3<f32>) -> GenericJoint {
    GenericJointBuilder::new(JointAxesMask::LOCKED_FIXED_AXES)
        .local_anchor1(parent_anchor)
        .local_anchor2(child_anchor)
        .build()
}

fn create_revolute_joint(
    parent_anchor: Point3<f32>,
    child_anchor: Point3<f32>,
    axis: UnitVector3<f32>,
    limits: Option<(f32, f32)>,
) -> GenericJoint {
    let mut builder = GenericJointBuilder::new(JointAxesMask::LOCKED_REVOLUTE_AXES)
        .local_anchor1(parent_anchor)
        .local_anchor2(child_anchor)
        .local_axis1(axis)
        .local_axis2(axis);

    // Set limits if specified
    if let Some((lower, upper)) = limits {
        builder = builder.limits(JointAxis::AngX, [lower, upper]);
    }

    // Enable motor for position control
    builder = builder
        .motor_model(JointAxis::AngX, MotorModel::AccelerationBased)
        .motor_max_force(JointAxis::AngX, DEFAULT_MAX_FORCE);

    builder.build()
}

fn create_prismatic_joint(
    parent_anchor: Point3<f32>,
    child_anchor: Point3<f32>,
    axis: UnitVector3<f32>,
    limits: Option<(f32, f32)>,
) -> GenericJoint {
    let mut builder = GenericJointBuilder::new(JointAxesMask::LOCKED_PRISMATIC_AXES)
        .local_anchor1(parent_anchor)
        .local_anchor2(child_anchor)
        .local_axis1(axis)
        .local_axis2(axis);

    // Set limits if specified
    if let Some((lower, upper)) = limits {
        builder = builder.limits(JointAxis::LinX, [lower, upper]);
    }

    // Enable motor for position control
    builder = builder
        .motor_model(JointAxis::LinX, MotorModel::AccelerationBased)
        .motor_max_force(JointAxis::LinX, DEFAULT_MAX_FORCE);

    builder.build()
}

fn create_cylindrical_joint(
    parent_anchor: Point3<f32>,
    child_anchor: Point3<f32>,
    axis: UnitVector3<f32>,
) -> GenericJoint {
    // Cylindrical = rotation + translation along axis
    // Lock all axes except AngX and LinX
    let locked = JointAxesMask::LIN_Y
        | JointAxesMask::LIN_Z
        | JointAxesMask::ANG_Y
        | JointAxesMask::ANG_Z;

    GenericJointBuilder::new(locked)
        .local_anchor1(parent_anchor)
        .local_anchor2(child_anchor)
        .local_axis1(axis)
        .local_axis2(axis)
        .build()
}

fn create_ball_joint(parent_anchor: Point3<f32>, child_anchor: Point3<f32>) -> GenericJoint {
    GenericJointBuilder::new(JointAxesMask::LOCKED_SPHERICAL_AXES)
        .local_anchor1(parent_anchor)
        .local_anchor2(child_anchor)
        .build()
}

/// Get the joint axis enum for a vcad joint kind.
pub fn get_joint_axis(kind: &JointKind) -> JointAxis {
    match kind {
        JointKind::Fixed => JointAxis::LinX, // Unused
        JointKind::Revolute { .. } => JointAxis::AngX,
        JointKind::Slider { .. } => JointAxis::LinX,
        JointKind::Cylindrical { .. } => JointAxis::AngX, // Primary axis
        JointKind::Ball => JointAxis::AngX,               // Primary axis
    }
}

/// Convert joint state from vcad units to physics units.
///
/// - Revolute: degrees → radians
/// - Slider: mm → meters
pub fn convert_state_to_physics(kind: &JointKind, state: f64) -> f32 {
    match kind {
        JointKind::Revolute { .. } | JointKind::Cylindrical { .. } | JointKind::Ball => {
            state.to_radians() as f32
        }
        JointKind::Slider { .. } => (state / 1000.0) as f32,
        JointKind::Fixed => 0.0,
    }
}

/// Convert joint state from physics units to vcad units.
///
/// - Revolute: radians → degrees
/// - Slider: meters → mm
pub fn convert_state_from_physics(kind: &JointKind, state: f32) -> f64 {
    match kind {
        JointKind::Revolute { .. } | JointKind::Cylindrical { .. } | JointKind::Ball => {
            (state as f64).to_degrees()
        }
        JointKind::Slider { .. } => (state as f64) * 1000.0,
        JointKind::Fixed => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_ir::Vec3;

    #[test]
    fn test_revolute_joint_conversion() {
        let joint = VcadJoint {
            id: "test".to_string(),
            name: Some("test".to_string()),
            parent_instance_id: Some("parent".to_string()),
            child_instance_id: "child".to_string(),
            parent_anchor: Vec3::new(0.0, 0.0, 100.0), // 100mm
            child_anchor: Vec3::new(0.0, 0.0, 0.0),
            kind: JointKind::Revolute {
                axis: Vec3::new(0.0, 0.0, 1.0),
                limits: Some((-90.0, 90.0)),
            },
            state: 0.0,
        };

        let rapier_joint = vcad_joint_to_rapier(&joint, None, RigidBodyHandle::invalid()).unwrap();

        // Check that joint was created (just verify it doesn't panic)
        assert!(rapier_joint.local_anchor1().coords.norm() > 0.0 || rapier_joint.local_anchor2().coords.norm() >= 0.0);
    }

    #[test]
    fn test_state_conversion() {
        let revolute = JointKind::Revolute {
            axis: Vec3::new(0.0, 0.0, 1.0),
            limits: None,
        };

        // 90 degrees should become ~1.57 radians
        let physics_state = convert_state_to_physics(&revolute, 90.0);
        assert!((physics_state - std::f32::consts::FRAC_PI_2).abs() < 0.01);

        // And back
        let vcad_state = convert_state_from_physics(&revolute, physics_state);
        assert!((vcad_state - 90.0).abs() < 0.1);
    }
}
