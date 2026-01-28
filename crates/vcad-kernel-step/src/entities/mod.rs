//! STEP entity type definitions and parsing utilities.
//!
//! This module provides structures for common AP214 STEP entities and utilities
//! for extracting them from parsed STEP data.

pub mod geometry;
pub mod curves;
pub mod surfaces;
pub mod topology;

pub use geometry::*;
// curves re-exports are currently internal-only
pub use surfaces::*;
pub use topology::*;

use crate::error::StepError;
use crate::parser::{StepEntity, StepFile, StepValue};

/// Helper trait for extracting argument values from STEP entities.
pub trait EntityArgs {
    /// Get arguments slice (reserved for future complex entity support).
    #[allow(dead_code)]
    fn args(&self) -> &[StepValue];

    /// Get a required real argument at index.
    fn real(&self, idx: usize) -> Result<f64, StepError>;

    /// Get a required integer argument at index (reserved for NURBS degree).
    #[allow(dead_code)]
    fn integer(&self, idx: usize) -> Result<i64, StepError>;

    /// Get a required string argument at index (reserved for parsing names).
    #[allow(dead_code)]
    fn string(&self, idx: usize) -> Result<&str, StepError>;

    /// Get a required enum argument at index.
    fn enumeration(&self, idx: usize) -> Result<&str, StepError>;

    /// Get a required entity reference at index.
    fn entity_ref(&self, idx: usize) -> Result<u64, StepError>;

    /// Get a required list argument at index.
    fn list(&self, idx: usize) -> Result<&[StepValue], StepError>;

    /// Get a list of reals at index.
    fn real_list(&self, idx: usize) -> Result<Vec<f64>, StepError>;

    /// Get a list of entity references at index.
    fn entity_ref_list(&self, idx: usize) -> Result<Vec<u64>, StepError>;

    /// Check if argument at index is null.
    fn is_null(&self, idx: usize) -> bool;
}

impl EntityArgs for StepEntity {
    fn args(&self) -> &[StepValue] {
        &self.args
    }

    fn real(&self, idx: usize) -> Result<f64, StepError> {
        self.args
            .get(idx)
            .and_then(|v| v.as_real())
            .ok_or_else(|| {
                StepError::parser(
                    Some(self.id),
                    format!("expected real at arg {idx} in {}", self.type_name),
                )
            })
    }

    fn integer(&self, idx: usize) -> Result<i64, StepError> {
        self.args
            .get(idx)
            .and_then(|v| v.as_integer())
            .ok_or_else(|| {
                StepError::parser(
                    Some(self.id),
                    format!("expected integer at arg {idx} in {}", self.type_name),
                )
            })
    }

    fn string(&self, idx: usize) -> Result<&str, StepError> {
        self.args
            .get(idx)
            .and_then(|v| v.as_string())
            .ok_or_else(|| {
                StepError::parser(
                    Some(self.id),
                    format!("expected string at arg {idx} in {}", self.type_name),
                )
            })
    }

    fn enumeration(&self, idx: usize) -> Result<&str, StepError> {
        self.args
            .get(idx)
            .and_then(|v| v.as_enum())
            .ok_or_else(|| {
                StepError::parser(
                    Some(self.id),
                    format!("expected enum at arg {idx} in {}", self.type_name),
                )
            })
    }

    fn entity_ref(&self, idx: usize) -> Result<u64, StepError> {
        self.args
            .get(idx)
            .and_then(|v| v.as_entity_ref())
            .ok_or_else(|| {
                StepError::parser(
                    Some(self.id),
                    format!("expected entity ref at arg {idx} in {}", self.type_name),
                )
            })
    }

    fn list(&self, idx: usize) -> Result<&[StepValue], StepError> {
        self.args
            .get(idx)
            .and_then(|v| v.as_list())
            .ok_or_else(|| {
                StepError::parser(
                    Some(self.id),
                    format!("expected list at arg {idx} in {}", self.type_name),
                )
            })
    }

    fn real_list(&self, idx: usize) -> Result<Vec<f64>, StepError> {
        let list = self.list(idx)?;
        list.iter()
            .enumerate()
            .map(|(i, v)| {
                v.as_real().ok_or_else(|| {
                    StepError::parser(
                        Some(self.id),
                        format!("expected real at list[{i}] in arg {idx}"),
                    )
                })
            })
            .collect()
    }

    fn entity_ref_list(&self, idx: usize) -> Result<Vec<u64>, StepError> {
        let list = self.list(idx)?;
        list.iter()
            .enumerate()
            .map(|(i, v)| {
                v.as_entity_ref().ok_or_else(|| {
                    StepError::parser(
                        Some(self.id),
                        format!("expected entity ref at list[{i}] in arg {idx}"),
                    )
                })
            })
            .collect()
    }

    fn is_null(&self, idx: usize) -> bool {
        self.args.get(idx).map(|v| v.is_null()).unwrap_or(true)
    }
}

/// Requires an entity of a specific type from the STEP file (reserved for strict parsing).
#[allow(dead_code)]
pub fn require_entity<'a>(
    file: &'a StepFile,
    id: u64,
    expected_type: &str,
) -> Result<&'a StepEntity, StepError> {
    let entity = file.require(id)?;
    if entity.type_name != expected_type {
        return Err(StepError::type_mismatch(expected_type, &entity.type_name));
    }
    Ok(entity)
}

/// Check if an entity is of a specific type (reserved for polymorphic entity handling).
#[allow(dead_code)]
pub fn is_entity_type(file: &StepFile, id: u64, type_name: &str) -> bool {
    file.get(id).map(|e| e.type_name == type_name).unwrap_or(false)
}
