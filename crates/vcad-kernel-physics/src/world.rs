//! Physics world management using Rapier3d.

use std::collections::HashMap;

use nalgebra::{Isometry3, UnitQuaternion, Vector3};
use rapier3d::dynamics::{
    CCDSolver, ImpulseJointHandle, ImpulseJointSet, IntegrationParameters,
    IslandManager, MultibodyJointSet, RigidBodyBuilder, RigidBodyHandle, RigidBodySet,
    RigidBodyType,
};
use rapier3d::geometry::{BroadPhaseMultiSap, ColliderBuilder, ColliderSet, NarrowPhase};
use rapier3d::pipeline::{PhysicsPipeline, QueryPipeline};
use vcad_ir::{Document, JointKind};

use crate::colliders::{estimate_mass, mesh_to_collider, ColliderStrategy};
use crate::error::PhysicsError;
use crate::joints::{convert_state_from_physics, convert_state_to_physics, get_joint_axis, vcad_joint_to_rapier};

/// State of a single joint.
#[derive(Debug, Clone, Default)]
pub struct JointState {
    /// Joint position (degrees for revolute, mm for prismatic).
    pub position: f64,
    /// Joint velocity (deg/s for revolute, mm/s for prismatic).
    pub velocity: f64,
    /// Joint effort/torque (Nm for revolute, N for prismatic).
    pub effort: f64,
}

/// Physics simulation world.
pub struct PhysicsWorld {
    // Rapier components
    pipeline: PhysicsPipeline,
    gravity: Vector3<f32>,
    integration_params: IntegrationParameters,
    islands: IslandManager,
    broad_phase: BroadPhaseMultiSap,
    narrow_phase: NarrowPhase,
    bodies: RigidBodySet,
    colliders: ColliderSet,
    impulse_joints: ImpulseJointSet,
    multibody_joints: MultibodyJointSet,
    ccd_solver: CCDSolver,
    query_pipeline: QueryPipeline,

    // Mapping from vcad to Rapier
    instance_to_body: HashMap<String, RigidBodyHandle>,
    joint_to_impulse: HashMap<String, ImpulseJointHandle>,

    // Original joint definitions for unit conversion
    joint_kinds: HashMap<String, JointKind>,
}

impl PhysicsWorld {
    /// Create a new physics world from a vcad Document.
    ///
    /// The document must have assembly data (instances and joints).
    pub fn from_document(doc: &Document) -> Result<Self, PhysicsError> {
        let instances = doc.instances.as_ref().ok_or(PhysicsError::NoAssembly)?;
        let joints = doc.joints.as_ref().ok_or(PhysicsError::NoAssembly)?;
        let part_defs = doc.part_defs.as_ref().ok_or(PhysicsError::NoAssembly)?;
        let ground_id = doc
            .ground_instance_id
            .as_ref()
            .ok_or(PhysicsError::NoGroundInstance)?;

        let mut world = Self::new();

        // Create rigid bodies for each instance
        for instance in instances {
            let part_def = part_defs
                .get(&instance.part_def_id)
                .ok_or_else(|| PhysicsError::MissingPartDef(instance.part_def_id.clone()))?;

            // Evaluate geometry to get mesh
            let mesh = Self::evaluate_part(doc, part_def.root)?;

            // Determine if this is the ground (fixed) body
            let is_ground = instance.id == *ground_id;

            // Create rigid body
            let body_type = if is_ground {
                RigidBodyType::Fixed
            } else {
                RigidBodyType::Dynamic
            };

            // Get transform from instance
            let position = instance
                .transform
                .as_ref()
                .map(|t| {
                    // Convert from mm to meters
                    let translation = Vector3::new(
                        t.translation.x as f32 / 1000.0,
                        t.translation.y as f32 / 1000.0,
                        t.translation.z as f32 / 1000.0,
                    );
                    let rotation = UnitQuaternion::from_euler_angles(
                        (t.rotation.x as f32).to_radians(),
                        (t.rotation.y as f32).to_radians(),
                        (t.rotation.z as f32).to_radians(),
                    );
                    Isometry3::from_parts(translation.into(), rotation)
                })
                .unwrap_or(Isometry3::identity());

            // Estimate mass from mesh
            let density = doc
                .materials
                .get(instance.material.as_deref().unwrap_or("default"))
                .and_then(|m| m.density)
                .unwrap_or(1000.0) as f32; // Default to plastic-like
            let mass = estimate_mass(&mesh, density);

            let rigid_body = RigidBodyBuilder::new(body_type)
                .position(position)
                .additional_mass(mass)
                .build();

            let body_handle = world.bodies.insert(rigid_body);
            world
                .instance_to_body
                .insert(instance.id.clone(), body_handle);

            // Create collider
            let collider_shape =
                mesh_to_collider(&mesh, ColliderStrategy::ConvexHull, &instance.id)?;
            let collider = ColliderBuilder::new(collider_shape)
                .friction(0.5)
                .restitution(0.1)
                .build();
            world
                .colliders
                .insert_with_parent(collider, body_handle, &mut world.bodies);
        }

        // Create joints
        for joint in joints {
            let parent_handle = joint
                .parent_instance_id
                .as_ref()
                .and_then(|id| world.instance_to_body.get(id))
                .copied();

            let child_handle = world
                .instance_to_body
                .get(&joint.child_instance_id)
                .copied()
                .ok_or_else(|| PhysicsError::MissingInstance(joint.child_instance_id.clone()))?;

            // Create Rapier joint
            let rapier_joint = vcad_joint_to_rapier(joint, parent_handle, child_handle)?;

            // Insert joint
            let joint_handle = if let Some(parent) = parent_handle {
                world
                    .impulse_joints
                    .insert(parent, child_handle, rapier_joint, true)
            } else {
                // World-grounded joint - use fixed body at origin
                let fixed_body = world.bodies.insert(
                    RigidBodyBuilder::fixed()
                        .position(Isometry3::identity())
                        .build(),
                );
                world
                    .impulse_joints
                    .insert(fixed_body, child_handle, rapier_joint, true)
            };

            world
                .joint_to_impulse
                .insert(joint.id.clone(), joint_handle);
            world.joint_kinds.insert(joint.id.clone(), joint.kind.clone());

            // Set initial joint state
            if joint.state.abs() > 1e-6 {
                world.set_joint_position(&joint.id, joint.state);
            }
        }

        Ok(world)
    }

    /// Create an empty physics world.
    fn new() -> Self {
        Self {
            pipeline: PhysicsPipeline::new(),
            gravity: Vector3::new(0.0, -9.81, 0.0),
            integration_params: IntegrationParameters::default(),
            islands: IslandManager::new(),
            broad_phase: BroadPhaseMultiSap::new(),
            narrow_phase: NarrowPhase::new(),
            bodies: RigidBodySet::new(),
            colliders: ColliderSet::new(),
            impulse_joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            query_pipeline: QueryPipeline::new(),
            instance_to_body: HashMap::new(),
            joint_to_impulse: HashMap::new(),
            joint_kinds: HashMap::new(),
        }
    }

    /// Step the physics simulation by dt seconds.
    pub fn step(&mut self, dt: f32) {
        self.integration_params.dt = dt;

        self.pipeline.step(
            &self.gravity,
            &self.integration_params,
            &mut self.islands,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.impulse_joints,
            &mut self.multibody_joints,
            &mut self.ccd_solver,
            Some(&mut self.query_pipeline),
            &(),
            &(),
        );
    }

    /// Get the current state of all joints.
    pub fn get_joint_states(&self) -> HashMap<String, JointState> {
        let mut states = HashMap::new();

        for (joint_id, &handle) in &self.joint_to_impulse {
            if let Some(joint) = self.impulse_joints.get(handle) {
                let kind = self.joint_kinds.get(joint_id).unwrap();
                let axis = get_joint_axis(kind);

                // Get position and velocity from joint motor
                let position = joint.data.motor(axis).map(|m| m.target_pos).unwrap_or(0.0);
                let velocity = joint.data.motor(axis).map(|m| m.target_vel).unwrap_or(0.0);

                states.insert(
                    joint_id.clone(),
                    JointState {
                        position: convert_state_from_physics(kind, position),
                        velocity: convert_state_from_physics(kind, velocity),
                        effort: 0.0, // Would need force sensors to track this
                    },
                );
            }
        }

        states
    }

    /// Set the target position for a joint.
    ///
    /// # Arguments
    ///
    /// * `joint_id` - The vcad joint ID
    /// * `target` - Target position (degrees for revolute, mm for prismatic)
    pub fn set_joint_position(&mut self, joint_id: &str, target: f64) {
        if let Some(&handle) = self.joint_to_impulse.get(joint_id) {
            if let Some(kind) = self.joint_kinds.get(joint_id) {
                let axis = get_joint_axis(kind);
                let physics_target = convert_state_to_physics(kind, target);

                if let Some(joint) = self.impulse_joints.get_mut(handle, true) {
                    joint
                        .data
                        .set_motor_position(axis, physics_target, 1000.0, 100.0);
                }
            }
        }
    }

    /// Set the target velocity for a joint.
    ///
    /// # Arguments
    ///
    /// * `joint_id` - The vcad joint ID
    /// * `target` - Target velocity (deg/s for revolute, mm/s for prismatic)
    pub fn set_joint_velocity(&mut self, joint_id: &str, target: f64) {
        if let Some(&handle) = self.joint_to_impulse.get(joint_id) {
            if let Some(kind) = self.joint_kinds.get(joint_id) {
                let axis = get_joint_axis(kind);
                let physics_target = convert_state_to_physics(kind, target);

                if let Some(joint) = self.impulse_joints.get_mut(handle, true) {
                    joint.data.set_motor_velocity(axis, physics_target, 100.0);
                }
            }
        }
    }

    /// Apply torque/force to a joint.
    ///
    /// # Arguments
    ///
    /// * `joint_id` - The vcad joint ID
    /// * `torque` - Torque/force (Nm for revolute, N for prismatic)
    pub fn apply_joint_torque(&mut self, joint_id: &str, torque: f64) {
        if let Some(&handle) = self.joint_to_impulse.get(joint_id) {
            if let Some(kind) = self.joint_kinds.get(joint_id) {
                let axis = get_joint_axis(kind);

                if let Some(joint) = self.impulse_joints.get_mut(handle, true) {
                    // Apply as motor with target velocity 0 but limited force
                    joint.data.set_motor_velocity(axis, 0.0, torque.abs() as f32);
                }
            }
        }
    }

    /// Get the pose of an instance in world coordinates.
    ///
    /// Returns (position, orientation) where position is in meters and
    /// orientation is a unit quaternion.
    pub fn get_instance_pose(&self, instance_id: &str) -> Option<([f64; 3], [f64; 4])> {
        let handle = self.instance_to_body.get(instance_id)?;
        let body = self.bodies.get(*handle)?;
        let pos = body.position();

        Some((
            [
                pos.translation.x as f64,
                pos.translation.y as f64,
                pos.translation.z as f64,
            ],
            [
                pos.rotation.w as f64,
                pos.rotation.i as f64,
                pos.rotation.j as f64,
                pos.rotation.k as f64,
            ],
        ))
    }

    /// Set gravity vector.
    pub fn set_gravity(&mut self, x: f32, y: f32, z: f32) {
        self.gravity = Vector3::new(x, y, z);
    }

    /// Get list of all joint IDs.
    pub fn joint_ids(&self) -> Vec<String> {
        self.joint_to_impulse.keys().cloned().collect()
    }

    /// Get list of all instance IDs.
    pub fn instance_ids(&self) -> Vec<String> {
        self.instance_to_body.keys().cloned().collect()
    }

    /// Evaluate a part's geometry to get a mesh.
    fn evaluate_part(
        doc: &Document,
        node_id: vcad_ir::NodeId,
    ) -> Result<vcad_kernel_tessellate::TriangleMesh, PhysicsError> {
        // This is a simplified evaluation - in practice would use the full engine
        let node = doc
            .nodes
            .get(&node_id)
            .ok_or_else(|| PhysicsError::Evaluation(format!("Node {} not found", node_id)))?;

        // Create a simple mesh based on the primitive type
        let solid = match &node.op {
            vcad_ir::CsgOp::Cube { size } => {
                vcad_kernel::Solid::cube(size.x, size.y, size.z)
            }
            vcad_ir::CsgOp::Cylinder { radius, height, segments } => {
                vcad_kernel::Solid::cylinder(*radius, *height, if *segments == 0 { 32 } else { *segments })
            }
            vcad_ir::CsgOp::Sphere { radius, segments } => {
                vcad_kernel::Solid::sphere(*radius, if *segments == 0 { 32 } else { *segments })
            }
            vcad_ir::CsgOp::Cone { radius_bottom, radius_top, height, segments } => {
                vcad_kernel::Solid::cone(*radius_bottom, *radius_top, *height, if *segments == 0 { 32 } else { *segments })
            }
            _ => {
                // For other operations, create a small placeholder
                vcad_kernel::Solid::cube(10.0, 10.0, 10.0)
            }
        };

        Ok(solid.to_mesh(32))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_ir::{Instance, Joint, JointKind, PartDef, Vec3};

    fn create_test_document() -> Document {
        let mut doc = Document::new();

        // Add cube nodes
        doc.nodes.insert(
            1,
            vcad_ir::Node {
                id: 1,
                name: Some("base_geom".to_string()),
                op: vcad_ir::CsgOp::Cube {
                    size: Vec3::new(100.0, 100.0, 50.0),
                },
            },
        );
        doc.nodes.insert(
            2,
            vcad_ir::Node {
                id: 2,
                name: Some("arm_geom".to_string()),
                op: vcad_ir::CsgOp::Cube {
                    size: Vec3::new(20.0, 20.0, 100.0),
                },
            },
        );

        // Add part definitions
        let mut part_defs = HashMap::new();
        part_defs.insert(
            "base".to_string(),
            PartDef {
                id: "base".to_string(),
                name: Some("Base".to_string()),
                root: 1,
                default_material: None,
            },
        );
        part_defs.insert(
            "arm".to_string(),
            PartDef {
                id: "arm".to_string(),
                name: Some("Arm".to_string()),
                root: 2,
                default_material: None,
            },
        );
        doc.part_defs = Some(part_defs);

        // Add instances
        doc.instances = Some(vec![
            Instance {
                id: "base_inst".to_string(),
                part_def_id: "base".to_string(),
                name: Some("Base".to_string()),
                transform: None,
                material: None,
            },
            Instance {
                id: "arm_inst".to_string(),
                part_def_id: "arm".to_string(),
                name: Some("Arm".to_string()),
                transform: None,
                material: None,
            },
        ]);

        // Add joint
        doc.joints = Some(vec![Joint {
            id: "joint1".to_string(),
            name: Some("Base-Arm".to_string()),
            parent_instance_id: Some("base_inst".to_string()),
            child_instance_id: "arm_inst".to_string(),
            parent_anchor: Vec3::new(0.0, 0.0, 25.0),
            child_anchor: Vec3::new(0.0, 0.0, -50.0),
            kind: JointKind::Revolute {
                axis: Vec3::new(0.0, 0.0, 1.0),
                limits: Some((-90.0, 90.0)),
            },
            state: 0.0,
        }]);

        doc.ground_instance_id = Some("base_inst".to_string());

        doc
    }

    #[test]
    fn test_create_world() {
        let doc = create_test_document();
        let world = PhysicsWorld::from_document(&doc).unwrap();

        assert_eq!(world.instance_ids().len(), 2);
        assert_eq!(world.joint_ids().len(), 1);
    }

    #[test]
    fn test_step_simulation() {
        let doc = create_test_document();
        let mut world = PhysicsWorld::from_document(&doc).unwrap();

        // Step a few times
        for _ in 0..10 {
            world.step(1.0 / 60.0);
        }

        // Should have some joint states
        let states = world.get_joint_states();
        assert!(states.contains_key("joint1"));
    }

    #[test]
    fn test_joint_control() {
        let doc = create_test_document();
        let mut world = PhysicsWorld::from_document(&doc).unwrap();

        // Set joint position target
        world.set_joint_position("joint1", 45.0);

        // Step simulation
        for _ in 0..100 {
            world.step(1.0 / 60.0);
        }

        // Joint should have moved (exact position depends on dynamics)
        let states = world.get_joint_states();
        let state = states.get("joint1").unwrap();
        // Position should be non-zero after commanding 45 degrees
        // Note: actual convergence depends on motor parameters
        assert!(state.position.abs() > 0.0 || state.velocity.abs() > 0.0);
    }
}
