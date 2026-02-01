//! WASM bindings for the vcad slicer.

use serde::{Deserialize, Serialize};
use vcad_kernel_tessellate::TriangleMesh;
use vcad_slicer::{InfillPattern, SliceSettings};
use vcad_slicer_gcode::{GcodeSettings, PrinterProfile};
use wasm_bindgen::prelude::*;

/// Initialize panic hook for better error messages.
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Slicer settings for WASM.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct WasmSliceSettings {
    /// Layer height (mm).
    pub layer_height: f64,
    /// First layer height (mm).
    pub first_layer_height: f64,
    /// Nozzle diameter (mm).
    pub nozzle_diameter: f64,
    /// Line width (mm).
    pub line_width: f64,
    /// Wall count.
    pub wall_count: u32,
    /// Infill density (0-1).
    pub infill_density: f64,
    /// Infill pattern (0=Grid, 1=Lines, 2=Triangles, 3=Honeycomb, 4=Gyroid).
    pub infill_pattern: u32,
    /// Enable support.
    pub support_enabled: bool,
    /// Support angle threshold.
    pub support_angle: f64,
}

#[wasm_bindgen]
impl WasmSliceSettings {
    /// Create default settings.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            layer_height: 0.2,
            first_layer_height: 0.25,
            nozzle_diameter: 0.4,
            line_width: 0.45,
            wall_count: 3,
            infill_density: 0.15,
            infill_pattern: 0,
            support_enabled: false,
            support_angle: 45.0,
        }
    }

    /// Create from JSON.
    #[wasm_bindgen(js_name = fromJson)]
    pub fn from_json(json: &str) -> Result<WasmSliceSettings, JsError> {
        serde_json::from_str(json).map_err(|e| JsError::new(&e.to_string()))
    }

    /// Convert to JSON.
    #[wasm_bindgen(js_name = toJson)]
    pub fn to_json(&self) -> Result<String, JsError> {
        serde_json::to_string(self).map_err(|e| JsError::new(&e.to_string()))
    }
}

impl Default for WasmSliceSettings {
    fn default() -> Self {
        Self::new()
    }
}

impl From<WasmSliceSettings> for SliceSettings {
    fn from(settings: WasmSliceSettings) -> Self {
        Self {
            layer_height: settings.layer_height,
            first_layer_height: settings.first_layer_height,
            nozzle_diameter: settings.nozzle_diameter,
            line_width: settings.line_width,
            wall_count: settings.wall_count,
            infill_density: settings.infill_density,
            infill_pattern: match settings.infill_pattern {
                0 => InfillPattern::Grid,
                1 => InfillPattern::Lines,
                2 => InfillPattern::Triangles,
                3 => InfillPattern::Honeycomb,
                _ => InfillPattern::Gyroid,
            },
            support_enabled: settings.support_enabled,
            support_angle: settings.support_angle,
        }
    }
}

/// Slice result for WASM.
#[wasm_bindgen]
pub struct WasmSliceResult {
    inner: vcad_slicer::SliceResult,
}

#[wasm_bindgen]
impl WasmSliceResult {
    /// Get number of layers.
    #[wasm_bindgen(getter, js_name = layerCount)]
    pub fn layer_count(&self) -> usize {
        self.inner.stats.layer_count
    }

    /// Get estimated print time in seconds.
    #[wasm_bindgen(getter, js_name = printTimeSeconds)]
    pub fn print_time_seconds(&self) -> f64 {
        self.inner.stats.print_time_seconds
    }

    /// Get filament usage in mm.
    #[wasm_bindgen(getter, js_name = filamentMm)]
    pub fn filament_mm(&self) -> f64 {
        self.inner.stats.filament_mm
    }

    /// Get filament weight in grams.
    #[wasm_bindgen(getter, js_name = filamentGrams)]
    pub fn filament_grams(&self) -> f64 {
        self.inner.stats.filament_grams
    }

    /// Get stats as JSON.
    #[wasm_bindgen(js_name = statsJson)]
    pub fn stats_json(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.inner.stats).map_err(|e| JsError::new(&e.to_string()))
    }

    /// Get layer data for preview (contours as arrays of points).
    #[wasm_bindgen(js_name = getLayerPreview)]
    pub fn get_layer_preview(&self, layer_index: usize) -> Result<JsValue, JsError> {
        if layer_index >= self.inner.layers.len() {
            return Err(JsError::new("layer index out of bounds"));
        }

        let layer = &self.inner.layers[layer_index];

        // Convert to serializable format
        let preview = LayerPreview {
            z: layer.z,
            index: layer.index,
            outer_perimeters: layer
                .outer_perimeters
                .iter()
                .map(|p| p.points.iter().map(|pt| [pt.x, pt.y]).collect())
                .collect(),
            inner_perimeters: layer
                .inner_perimeters
                .iter()
                .map(|p| p.points.iter().map(|pt| [pt.x, pt.y]).collect())
                .collect(),
            infill: layer
                .infill
                .iter()
                .map(|p| p.points.iter().map(|pt| [pt.x, pt.y]).collect())
                .collect(),
        };

        serde_wasm_bindgen::to_value(&preview).map_err(|e| JsError::new(&e.to_string()))
    }
}

#[derive(Serialize)]
struct LayerPreview {
    z: f64,
    index: usize,
    outer_perimeters: Vec<Vec<[f64; 2]>>,
    inner_perimeters: Vec<Vec<[f64; 2]>>,
    infill: Vec<Vec<[f64; 2]>>,
}

/// Slice a mesh.
#[wasm_bindgen(js_name = sliceMesh)]
pub fn slice_mesh(
    vertices: &[f32],
    indices: &[u32],
    settings: &WasmSliceSettings,
) -> Result<WasmSliceResult, JsError> {
    let mesh = TriangleMesh {
        vertices: vertices.to_vec(),
        indices: indices.to_vec(),
        normals: Vec::new(),
    };

    let slice_settings: SliceSettings = settings.clone().into();
    let result =
        vcad_slicer::slice(&mesh, &slice_settings).map_err(|e| JsError::new(&e.to_string()))?;

    Ok(WasmSliceResult { inner: result })
}

/// Generate G-code from slice result.
#[wasm_bindgen(js_name = generateGcode)]
pub fn generate_gcode(
    result: &WasmSliceResult,
    printer_profile: &str,
    print_temp: u32,
    bed_temp: u32,
) -> Result<String, JsError> {
    let profile = match printer_profile {
        "bambu_x1c" => PrinterProfile::bambu_x1c(),
        "bambu_p1s" => PrinterProfile::bambu_p1s(),
        "bambu_a1" => PrinterProfile::bambu_a1(),
        "ender3" => PrinterProfile::ender3(),
        "prusa_mk4" => PrinterProfile::prusa_mk4(),
        "voron_24" => PrinterProfile::voron_24(),
        _ => PrinterProfile::generic(),
    };

    let settings = GcodeSettings {
        printer: profile,
        print_temp,
        bed_temp,
        ..Default::default()
    };

    Ok(vcad_slicer_gcode::generate_gcode(&result.inner, settings))
}

/// Get available printer profiles.
#[wasm_bindgen(js_name = getPrinterProfiles)]
pub fn get_printer_profiles() -> Result<JsValue, JsError> {
    let profiles: Vec<ProfileInfo> = PrinterProfile::all_profiles()
        .into_iter()
        .map(|p| ProfileInfo {
            id: profile_id(&p.name),
            name: p.name,
            bed_x: p.bed_x,
            bed_y: p.bed_y,
            bed_z: p.bed_z,
            nozzle_diameter: p.nozzle_diameter,
        })
        .collect();

    serde_wasm_bindgen::to_value(&profiles).map_err(|e| JsError::new(&e.to_string()))
}

fn profile_id(name: &str) -> String {
    name.to_lowercase()
        .replace(' ', "_")
        .replace("(", "")
        .replace(")", "")
}

#[derive(Serialize)]
struct ProfileInfo {
    id: String,
    name: String,
    bed_x: f64,
    bed_y: f64,
    bed_z: f64,
    nozzle_diameter: f64,
}

/// Get infill pattern options.
#[wasm_bindgen(js_name = getInfillPatterns)]
pub fn get_infill_patterns() -> Result<JsValue, JsError> {
    let patterns = vec![
        InfillPatternInfo {
            id: 0,
            name: "Grid".into(),
            description: "Rectilinear grid pattern".into(),
        },
        InfillPatternInfo {
            id: 1,
            name: "Lines".into(),
            description: "Alternating 45° lines".into(),
        },
        InfillPatternInfo {
            id: 2,
            name: "Triangles".into(),
            description: "Triangular infill".into(),
        },
        InfillPatternInfo {
            id: 3,
            name: "Honeycomb".into(),
            description: "Hexagonal pattern".into(),
        },
        InfillPatternInfo {
            id: 4,
            name: "Gyroid".into(),
            description: "TPMS gyroid pattern".into(),
        },
    ];

    serde_wasm_bindgen::to_value(&patterns).map_err(|e| JsError::new(&e.to_string()))
}

#[derive(Serialize)]
struct InfillPatternInfo {
    id: u32,
    name: String,
    description: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_default() {
        let settings = WasmSliceSettings::new();
        assert!((settings.layer_height - 0.2).abs() < 0.01);
    }
}
