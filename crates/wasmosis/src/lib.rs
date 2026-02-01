//! # wasmosis
//!
//! Lazy WASM module splitting for Rust.
//!
//! Mark functions with `#[wasmosis::module("name")]` to split them into separate
//! WASM modules that can be lazy loaded at runtime.
//!
//! ## Usage
//!
//! ```rust,ignore
//! use wasmosis::module;
//!
//! // This function will be split into a "step" module
//! #[module("step")]
//! #[wasm_bindgen]
//! pub fn import_step(data: &[u8]) -> Solid {
//!     // ...
//! }
//!
//! // Unmarked functions stay in the core module
//! #[wasm_bindgen]
//! pub fn create_cube(x: f64, y: f64, z: f64) -> Solid {
//!     // ...
//! }
//! ```
//!
//! ## How It Works
//!
//! 1. The `#[module]` macro adds a custom section to the WASM binary
//! 2. Run `wasmosis split input.wasm -o ./dist` to split the binary
//! 3. The CLI generates separate .wasm files and a TypeScript registry
//! 4. Use the registry to lazy load modules at runtime
//!
//! ## Custom Section Format
//!
//! The macro embeds JSON metadata in a custom section named "wasmosis_module":
//!
//! ```json
//! {"module": "step", "function": "import_step"}
//! ```

// Re-export the proc-macro
pub use wasmosis_macro::module;

/// The name of the custom section used by wasmosis.
pub const SECTION_NAME: &str = "wasmosis_module";
