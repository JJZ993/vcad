//! L-bracket with DXF export for laser cutting.

use vcad::export::DxfDocument;
use vcad::{centered_cube, centered_cylinder};

fn main() {
    // L-bracket: two plates joined at 90 degrees
    let base = centered_cube("base", 60.0, 40.0, 4.0);
    let wall = centered_cube("wall", 60.0, 4.0, 36.0).translate(0.0, -18.0, 20.0);

    // Mounting holes in the base
    let hole = centered_cylinder("hole", 3.0, 10.0, 32);
    let base_holes = hole
        .translate(-20.0, 0.0, 0.0)
        .union(&hole.translate(20.0, 0.0, 0.0));

    // Mounting holes in the wall
    let wall_holes = hole
        .rotate(90.0, 0.0, 0.0)
        .translate(-20.0, -18.0, 22.0)
        .union(&hole.rotate(90.0, 0.0, 0.0).translate(20.0, -18.0, 22.0));

    let bracket = base
        .union(&wall)
        .difference(&base_holes)
        .difference(&wall_holes);

    bracket.write_stl("bracket.stl").unwrap();
    println!("wrote bracket.stl");

    // DXF flat pattern for laser cutting
    let mut dxf = DxfDocument::new();
    // Base plate outline
    dxf.add_rectangle(60.0, 40.0, 0.0, 0.0);
    // Mounting holes
    dxf.add_circle(-20.0, 0.0, 3.0);
    dxf.add_circle(20.0, 0.0, 3.0);
    // Bend line where wall folds up
    dxf.add_bend_line(-30.0, -18.0, 30.0, -18.0);
    // Wall (unfolded)
    dxf.add_rectangle(60.0, 36.0, 0.0, -36.0);
    // Wall holes
    dxf.add_circle(-20.0, -34.0, 3.0);
    dxf.add_circle(20.0, -34.0, 3.0);

    dxf.export("bracket.dxf").unwrap();
    println!("wrote bracket.dxf");
}
