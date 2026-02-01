//! G-code flavor definitions.

use serde::{Deserialize, Serialize};

/// G-code flavor (dialect).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum GcodeFlavor {
    /// Marlin firmware (Ender, Prusa).
    #[default]
    Marlin,
    /// Klipper firmware.
    Klipper,
    /// Bambu Lab printers.
    Bambu,
    /// RepRap firmware.
    RepRap,
}

impl GcodeFlavor {
    /// Get the start G-code template for this flavor.
    pub fn start_gcode(&self) -> &'static str {
        match self {
            GcodeFlavor::Marlin => {
                "G28 ; Home all axes\n\
                 G29 ; Auto bed leveling\n\
                 M104 S{print_temp} ; Set nozzle temp\n\
                 M140 S{bed_temp} ; Set bed temp\n\
                 M109 S{print_temp} ; Wait for nozzle temp\n\
                 M190 S{bed_temp} ; Wait for bed temp\n\
                 G92 E0 ; Reset extruder\n\
                 G1 Z5 F3000 ; Move Z up\n"
            }
            GcodeFlavor::Klipper => {
                "G28 ; Home all axes\n\
                 BED_MESH_CALIBRATE ; Bed mesh\n\
                 M104 S{print_temp} ; Set nozzle temp\n\
                 M140 S{bed_temp} ; Set bed temp\n\
                 M109 S{print_temp} ; Wait for nozzle temp\n\
                 M190 S{bed_temp} ; Wait for bed temp\n\
                 G92 E0 ; Reset extruder\n"
            }
            GcodeFlavor::Bambu => {
                "; Bambu Lab start sequence\n\
                 M400 ; Wait for moves to finish\n\
                 G28 X ; Home X\n\
                 M109 S{print_temp} ; Wait for nozzle temp\n\
                 M190 S{bed_temp} ; Wait for bed temp\n\
                 G28 ; Home all\n\
                 G1 Z5 F3000\n"
            }
            GcodeFlavor::RepRap => {
                "G28 ; Home\n\
                 G29 ; Probe bed\n\
                 M104 S{print_temp}\n\
                 M140 S{bed_temp}\n\
                 M109 S{print_temp}\n\
                 M190 S{bed_temp}\n\
                 G92 E0\n"
            }
        }
    }

    /// Get the end G-code template for this flavor.
    pub fn end_gcode(&self) -> &'static str {
        match self {
            GcodeFlavor::Marlin => {
                "M104 S0 ; Turn off nozzle\n\
                 M140 S0 ; Turn off bed\n\
                 G91 ; Relative positioning\n\
                 G1 E-2 F2700 ; Retract\n\
                 G1 Z10 F3000 ; Move Z up\n\
                 G90 ; Absolute positioning\n\
                 G1 X0 Y200 F3000 ; Present print\n\
                 M84 ; Disable motors\n"
            }
            GcodeFlavor::Klipper => {
                "TURN_OFF_HEATERS\n\
                 G91\n\
                 G1 E-2 F2700\n\
                 G1 Z10 F3000\n\
                 G90\n\
                 G1 X0 Y200 F3000\n\
                 M84\n"
            }
            GcodeFlavor::Bambu => {
                "M400 ; Wait for moves\n\
                 M104 S0 ; Nozzle off\n\
                 M140 S0 ; Bed off\n\
                 G91\n\
                 G1 E-2 F2700\n\
                 G1 Z10 F3000\n\
                 G90\n\
                 M84\n"
            }
            GcodeFlavor::RepRap => {
                "M104 S0\n\
                 M140 S0\n\
                 G91\n\
                 G1 E-2 F2700\n\
                 G1 Z10 F3000\n\
                 G90\n\
                 G1 X0 Y200 F3000\n\
                 M84\n"
            }
        }
    }

    /// Get layer change G-code.
    pub fn layer_change_gcode(&self) -> &'static str {
        match self {
            GcodeFlavor::Bambu => "; LAYER_CHANGE\n",
            _ => "; layer change\n",
        }
    }

    /// Does this flavor support pressure advance / linear advance?
    pub fn supports_pressure_advance(&self) -> bool {
        matches!(self, GcodeFlavor::Klipper | GcodeFlavor::Marlin)
    }

    /// Does this flavor support input shaper?
    pub fn supports_input_shaper(&self) -> bool {
        matches!(self, GcodeFlavor::Klipper | GcodeFlavor::Bambu)
    }
}
