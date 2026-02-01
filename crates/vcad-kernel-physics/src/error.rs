//! Error types for physics simulation.

use thiserror::Error;

/// Errors that can occur during physics simulation.
#[derive(Error, Debug)]
pub enum PhysicsError {
    /// Document has no assembly data.
    #[error("Document has no assembly data (no instances or joints)")]
    NoAssembly,

    /// Missing part definition.
    #[error("Part definition not found: {0}")]
    MissingPartDef(String),

    /// Missing instance.
    #[error("Instance not found: {0}")]
    MissingInstance(String),

    /// Missing joint.
    #[error("Joint not found: {0}")]
    MissingJoint(String),

    /// Failed to create collision shape.
    #[error("Failed to create collision shape for {name}: {reason}")]
    CollisionShape {
        /// Part/instance name.
        name: String,
        /// Reason for failure.
        reason: String,
    },

    /// Invalid joint configuration.
    #[error("Invalid joint configuration: {0}")]
    InvalidJoint(String),

    /// No ground instance specified.
    #[error("No ground instance specified in document")]
    NoGroundInstance,

    /// Evaluation error.
    #[error("Failed to evaluate geometry: {0}")]
    Evaluation(String),
}
