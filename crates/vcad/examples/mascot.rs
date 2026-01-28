//! vcad mascot — a friendly little robot built entirely from CSG primitives.
//!
//! Exports both STL (single mesh) and GLB (multi-material scene).

use vcad::export::{export_scene_glb, Materials};
use vcad::{centered_cube, centered_cylinder, Part, Scene};

fn main() {
    let seg = 48; // smoothness for round parts

    // === Body ===
    // Rounded box: intersect a cube with a sphere for soft edges
    let body_cube = centered_cube("body_cube", 32.0, 24.0, 40.0);
    let body_round = Part::sphere("body_round", 24.0, seg);
    let body = body_cube
        .intersection(&body_round.scale(1.0, 1.0, 1.1))
        .translate(0.0, 0.0, 20.0);

    // === Head ===
    // Slightly squished sphere sitting on the body
    let head = Part::sphere("head", 16.0, seg)
        .scale(1.0, 0.9, 0.95)
        .translate(0.0, 0.0, 44.0);

    // === Eyes ===
    // Two small spheres poking out of the head
    let eye_r = 3.5;
    let eye_spread = 7.0;
    let eye_fwd = 12.0;
    let eye_z = 47.0;
    let eye_l = Part::sphere("eye_l", eye_r, seg).translate(-eye_spread, -eye_fwd, eye_z);
    let eye_r_part = Part::sphere("eye_r", eye_r, seg).translate(eye_spread, -eye_fwd, eye_z);

    // Pupils — smaller dark spheres
    let pupil_r = 2.0;
    let pupil_fwd = eye_fwd + 2.5;
    let pupil_l = Part::sphere("pupil_l", pupil_r, seg).translate(-eye_spread, -pupil_fwd, eye_z);
    let pupil_r_part =
        Part::sphere("pupil_r", pupil_r, seg).translate(eye_spread, -pupil_fwd, eye_z);

    // === Antenna ===
    let antenna_stalk = centered_cylinder("stalk", 1.5, 14.0, seg).translate(0.0, 0.0, 57.0);
    let antenna_ball = Part::sphere("ball", 3.5, seg).translate(0.0, 0.0, 65.0);

    // === Arms ===
    let arm_r = 3.5;
    let arm_len = 18.0;
    let arm_z = 24.0;
    let arm_l = centered_cylinder("arm_l", arm_r, arm_len, seg)
        .rotate(0.0, 90.0, 0.0)
        .translate(-24.0, 0.0, arm_z);
    let arm_r_part = centered_cylinder("arm_r", arm_r, arm_len, seg)
        .rotate(0.0, 90.0, 0.0)
        .translate(24.0, 0.0, arm_z);

    // Hands — small spheres
    let hand_l = Part::sphere("hand_l", 4.5, seg).translate(-34.0, 0.0, arm_z);
    let hand_r = Part::sphere("hand_r", 4.5, seg).translate(34.0, 0.0, arm_z);

    // === Legs ===
    let leg_r = 4.5;
    let leg_len = 12.0;
    let leg_spread = 8.0;
    let leg_l = centered_cylinder("leg_l", leg_r, leg_len, seg).translate(
        -leg_spread,
        0.0,
        -leg_len / 2.0 + 2.0,
    );
    let leg_r_part = centered_cylinder("leg_r", leg_r, leg_len, seg).translate(
        leg_spread,
        0.0,
        -leg_len / 2.0 + 2.0,
    );

    // Feet — flat rounded cubes
    let foot_l = centered_cube("foot_l", 12.0, 14.0, 4.0).translate(-leg_spread, -1.0, -5.0);
    let foot_r = centered_cube("foot_r", 12.0, 14.0, 4.0).translate(leg_spread, -1.0, -5.0);

    // === Belly button / chest detail ===
    let chest_circle = centered_cylinder("chest", 6.0, 2.0, seg)
        .rotate(90.0, 0.0, 0.0)
        .translate(0.0, -13.0, 22.0);

    // === Combined STL (single mesh) ===
    let mascot = body
        .union(&head)
        .union(&eye_l)
        .union(&eye_r_part)
        .union(&pupil_l)
        .union(&pupil_r_part)
        .union(&antenna_stalk)
        .union(&antenna_ball)
        .union(&arm_l)
        .union(&arm_r_part)
        .union(&hand_l)
        .union(&hand_r)
        .union(&leg_l)
        .union(&leg_r_part)
        .union(&foot_l)
        .union(&foot_r)
        .union(&chest_circle);

    mascot.write_stl("mascot.stl").unwrap();
    println!("wrote mascot.stl");

    // === Multi-material GLB scene ===
    let materials = Materials::parse(
        r#"
[materials.body]
color = [0.32, 0.72, 0.95]
metallic = 0.1
roughness = 0.5

[materials.face]
color = [0.95, 0.95, 0.97]
metallic = 0.0
roughness = 0.4

[materials.eye_white]
color = [1.0, 1.0, 1.0]
metallic = 0.0
roughness = 0.2

[materials.pupil]
color = [0.08, 0.08, 0.12]
metallic = 0.0
roughness = 0.3

[materials.antenna]
color = [0.95, 0.3, 0.35]
metallic = 0.3
roughness = 0.4

[materials.limb]
color = [0.25, 0.6, 0.85]
metallic = 0.1
roughness = 0.5

[materials.hand]
color = [0.95, 0.95, 0.97]
metallic = 0.0
roughness = 0.4

[materials.chest]
color = [0.95, 0.75, 0.2]
metallic = 0.3
roughness = 0.4
"#,
    )
    .unwrap();

    let mut scene = Scene::new("mascot");
    scene.add(body, "body");
    scene.add(head, "body");
    scene.add(eye_l, "eye_white");
    scene.add(eye_r_part, "eye_white");
    scene.add(pupil_l, "pupil");
    scene.add(pupil_r_part, "pupil");
    scene.add(antenna_stalk, "antenna");
    scene.add(antenna_ball, "antenna");
    scene.add(arm_l, "limb");
    scene.add(arm_r_part, "limb");
    scene.add(hand_l, "hand");
    scene.add(hand_r, "hand");
    scene.add(leg_l, "limb");
    scene.add(leg_r_part, "limb");
    scene.add(foot_l, "hand");
    scene.add(foot_r, "hand");
    scene.add(chest_circle, "chest");

    export_scene_glb(&scene, &materials, "mascot.glb").unwrap();
    println!("wrote mascot.glb");
}
