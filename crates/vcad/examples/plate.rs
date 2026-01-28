//! Mounting plate with bolt pattern — basic vcad usage.

use vcad::{bolt_pattern, centered_cube, centered_cylinder};

fn main() {
    // Rectangular plate
    let plate = centered_cube("plate", 120.0, 80.0, 5.0);

    // Center bore
    let bore = centered_cylinder("bore", 15.0, 10.0, 64);

    // Four corner mounting holes
    let m5 = centered_cylinder("m5", 2.7, 10.0, 32);
    let corners = m5
        .translate(-45.0, -25.0, 0.0)
        .union(&m5.translate(45.0, -25.0, 0.0))
        .union(&m5.translate(-45.0, 25.0, 0.0))
        .union(&m5.translate(45.0, 25.0, 0.0));

    // Bolt circle around center bore
    let bolt_holes = bolt_pattern(6, 50.0, 4.5, 10.0, 32);

    let part = plate
        .difference(&bore)
        .difference(&corners)
        .difference(&bolt_holes);

    part.write_stl("plate.stl").unwrap();
    println!("wrote plate.stl");
}
