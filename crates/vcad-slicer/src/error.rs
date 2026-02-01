//! Error types for the slicer.

use thiserror::Error;

/// Errors that can occur during slicing.
#[derive(Error, Debug)]
pub enum SlicerError {
    /// Mesh has no triangles.
    #[error("mesh is empty")]
    EmptyMesh,

    /// Mesh has degenerate geometry.
    #[error("mesh has degenerate geometry: {0}")]
    DegenerateMesh(String),

    /// Invalid slice settings.
    #[error("invalid settings: {0}")]
    InvalidSettings(String),

    /// Slicing operation failed.
    #[error("slicing failed: {0}")]
    SliceFailed(String),

    /// Contour tracing failed.
    #[error("contour tracing failed at z={0}: {1}")]
    ContourFailed(f64, String),
}

/// Result type for slicer operations.
pub type Result<T> = std::result::Result<T, SlicerError>;
