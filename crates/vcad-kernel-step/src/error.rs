//! Error types for STEP file operations.

use thiserror::Error;

/// Errors that can occur during STEP file operations.
#[derive(Error, Debug)]
pub enum StepError {
    /// I/O error reading or writing a file.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Lexer error: unexpected character or malformed token.
    #[error("Lexer error at line {line}, column {col}: {message}")]
    Lexer {
        /// Line number (1-indexed).
        line: usize,
        /// Column number (1-indexed).
        col: usize,
        /// Error message.
        message: String,
    },

    /// Parser error: unexpected token or malformed structure.
    #[error("Parser error{}: {message}", entity_id.map(|id| format!(" at entity #{}", id)).unwrap_or_default())]
    Parser {
        /// Entity ID where the error occurred, if known.
        entity_id: Option<u64>,
        /// Error message.
        message: String,
    },

    /// Missing entity reference.
    #[error("Missing entity reference: #{0}")]
    MissingEntity(u64),

    /// Unsupported entity type.
    #[error("Unsupported entity type: {0}")]
    UnsupportedEntity(String),

    /// Invalid geometry (e.g., degenerate surface, invalid axis).
    #[error("Invalid geometry: {0}")]
    InvalidGeometry(String),

    /// Invalid topology (e.g., non-manifold edge, open shell).
    #[error("Invalid topology: {0}")]
    InvalidTopology(String),

    /// Type mismatch (e.g., expected CARTESIAN_POINT but got DIRECTION).
    #[error("Type mismatch: expected {expected}, got {actual}")]
    TypeMismatch {
        /// Expected type name.
        expected: String,
        /// Actual type name.
        actual: String,
    },

    /// Empty file or no solids found.
    #[error("No solids found in STEP file")]
    NoSolids,
}

impl StepError {
    /// Create a lexer error.
    pub fn lexer(line: usize, col: usize, message: impl Into<String>) -> Self {
        Self::Lexer {
            line,
            col,
            message: message.into(),
        }
    }

    /// Create a parser error.
    pub fn parser(entity_id: Option<u64>, message: impl Into<String>) -> Self {
        Self::Parser {
            entity_id,
            message: message.into(),
        }
    }

    /// Create a type mismatch error.
    pub fn type_mismatch(expected: impl Into<String>, actual: impl Into<String>) -> Self {
        Self::TypeMismatch {
            expected: expected.into(),
            actual: actual.into(),
        }
    }
}
