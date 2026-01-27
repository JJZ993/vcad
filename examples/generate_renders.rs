//! Generate cookbook STL files for rendering — flanged hub and radial vent.

use vcad::{bolt_pattern, centered_cube, centered_cylinder};

fn main() {
    // === Flanged hub ===
    let hub = centered_cylinder("hub", 15.0, 20.0, 64);
    let flange = centered_cylinder("flange", 30.0, 4.0, 64).translate(0.0, 0.0, -10.0);
    let bore = centered_cylinder("bore", 5.0, 25.0, 32);
    let bolt_holes = bolt_pattern(6, 45.0, 3.0, 8.0, 32).translate(0.0, 0.0, -10.0);
    let hub_part = hub + flange - bore - bolt_holes;
    hub_part.write_stl("hub.stl").unwrap();
    println!("wrote hub.stl");

    // === Radial vent ===
    let slot = centered_cube("slot", 15.0, 2.0, 10.0);
    let vents = slot.circular_pattern(20.0, 8);
    let panel = centered_cylinder("panel", 35.0, 3.0, 64) - vents;
    panel.write_stl("vent.stl").unwrap();
    println!("wrote vent.stl");
}
