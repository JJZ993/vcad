//! Proc-macro implementation for wasmosis.
//!
//! This crate provides the `#[module("name")]` attribute macro that marks
//! functions for lazy loading in separate WASM modules.

use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, ItemFn, LitStr};

/// The custom section name used by wasmosis.
const SECTION_NAME: &str = "wasmosis_module";

/// Mark a function to be split into a separate WASM module.
///
/// # Arguments
///
/// * `module_name` - The name of the module this function should be split into.
///
/// # Example
///
/// ```rust,ignore
/// use wasmosis::module;
///
/// #[module("step")]
/// #[wasm_bindgen]
/// pub fn import_step(data: &[u8]) -> Result<Solid, JsError> {
///     vcad_kernel_step::import(data)
/// }
/// ```
///
/// # How It Works
///
/// This macro:
/// 1. Preserves the original function unchanged
/// 2. Adds a `#[link_section]` attribute embedding metadata in the WASM binary
/// 3. The metadata is JSON: `{"module": "step", "function": "import_step"}`
///
/// The wasmosis CLI tool reads these custom sections to determine how to split
/// the WASM binary into separate modules.
#[proc_macro_attribute]
pub fn module(attr: TokenStream, item: TokenStream) -> TokenStream {
    let module_name = parse_macro_input!(attr as LitStr);
    let input_fn = parse_macro_input!(item as ItemFn);

    let fn_name = &input_fn.sig.ident;
    let fn_name_str = fn_name.to_string();
    let module_name_str = module_name.value();

    // Create the metadata JSON
    let metadata = format!(
        r#"{{"module":"{}","function":"{}"}}"#,
        module_name_str, fn_name_str
    );
    let metadata_len = metadata.len();
    let metadata_bytes = metadata.as_bytes();

    // Create a unique identifier for the static that holds the metadata
    let static_name = syn::Ident::new(
        &format!("__WASMOSIS_META_{}", fn_name_str.to_uppercase()),
        fn_name.span(),
    );

    // Generate the output:
    // 1. A static with the metadata in a custom section (WASM only)
    // 2. The original function unchanged
    //
    // The #[link_section] attribute only works with WASM targets.
    // On native platforms, the static is still emitted but without
    // a custom section (used for testing without errors).
    let expanded = quote! {
        // Embed metadata in a custom WASM section
        // The section name is "wasmosis_module" and contains JSON metadata
        #[doc(hidden)]
        #[used]
        #[cfg_attr(target_arch = "wasm32", link_section = #SECTION_NAME)]
        static #static_name: [u8; #metadata_len] = [#(#metadata_bytes),*];

        // Original function unchanged
        #input_fn
    };

    TokenStream::from(expanded)
}

#[cfg(test)]
mod tests {
    // Note: proc-macro tests need to be done via a separate test crate
    // or using trybuild. Basic syntax validation happens at compile time.
}
