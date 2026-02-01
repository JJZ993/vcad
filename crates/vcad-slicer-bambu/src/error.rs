//! Error types for Bambu integration.

use thiserror::Error;

/// Errors from Bambu printer operations.
#[derive(Error, Debug)]
pub enum BambuError {
    /// Connection failed.
    #[error("connection failed: {0}")]
    ConnectionFailed(String),

    /// MQTT error.
    #[error("MQTT error: {0}")]
    MqttError(String),

    /// Authentication failed.
    #[error("authentication failed: {0}")]
    AuthenticationFailed(String),

    /// Printer not found.
    #[error("printer not found: {0}")]
    PrinterNotFound(String),

    /// Discovery error.
    #[error("discovery error: {0}")]
    DiscoveryError(String),

    /// 3MF generation error.
    #[error("3MF error: {0}")]
    ThreeMfError(String),

    /// Print error.
    #[error("print error: {0}")]
    PrintError(String),

    /// Timeout error.
    #[error("timeout: {0}")]
    Timeout(String),

    /// Invalid response.
    #[error("invalid response: {0}")]
    InvalidResponse(String),

    /// IO error.
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

/// Result type for Bambu operations.
pub type Result<T> = std::result::Result<T, BambuError>;
