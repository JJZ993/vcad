/**
 * Wood Grain Shader - Ring patterns with noise distortion.
 * Supports walnut, oak, bamboo via color uniforms.
 */

import * as THREE from "three";
import { noiseChunk } from "../chunks/noise.glsl";
import { fbmChunk } from "../chunks/fbm.glsl";
import { triplanarChunk } from "../chunks/triplanar.glsl";
import type { ProceduralShaderDef } from "../types";

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;

  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <logdepthbuf_pars_fragment>

${noiseChunk}
${fbmChunk}
${triplanarChunk}

uniform vec3 uDarkWood;
uniform vec3 uLightWood;
uniform float uRingScale;
uniform float uRingDistortion;
uniform float uGrainScale;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Wood grain pattern
float woodPattern(vec2 uv) {
  // Ring pattern from center
  float dist = length(uv);

  // Add noise distortion to rings
  float distortion = snoise(vec3(uv * uGrainScale, 0.0)) * uRingDistortion;

  // Create rings with noise modulation
  float rings = sin((dist + distortion) * uRingScale);

  // Add fine grain detail
  float grain = fbm(vec3(uv * uGrainScale * 2.0, 0.5)) * 0.2;

  // Combine rings and grain
  return rings * 0.5 + 0.5 + grain;
}

void main() {
  // Triplanar blend
  vec3 blend = triplanarBlend(vWorldNormal);

  // Sample wood pattern from each projection axis
  // Use XZ for top/bottom, YZ and XY for sides
  float patternX = woodPattern(vWorldPosition.yz);
  float patternY = woodPattern(vWorldPosition.xz);
  float patternZ = woodPattern(vWorldPosition.xy);

  float pattern = triplanarSample(patternX, patternY, patternZ, blend);

  // Mix between dark and light wood colors
  vec3 color = mix(uDarkWood, uLightWood, pattern);

  // Add subtle color variation for realism
  float colorNoise = snoise(vWorldPosition * 0.5) * 0.03;
  color += vec3(colorNoise);

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
  float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
  float ambient = 0.35;

  // Wood has subtle sheen
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(vWorldNormal, halfDir), 0.0), 16.0) * 0.15;

  vec3 finalColor = color * (ambient + diffuse * 0.65) + vec3(spec);

  // Add emissive
  finalColor += uEmissive * uEmissiveIntensity;

  gl_FragColor = vec4(finalColor, 1.0);

  #include <logdepthbuf_fragment>
}
`;

export const woodShader: ProceduralShaderDef = {
  key: "wood",
  vertexShader,
  fragmentShader,
  uniforms: {
    uDarkWood: { value: new THREE.Color(0.3, 0.2, 0.12) },
    uLightWood: { value: new THREE.Color(0.55, 0.4, 0.28) },
    uRingScale: { value: 20.0 },
    uRingDistortion: { value: 0.3 },
    uGrainScale: { value: 4.0 },
    uEmissive: { value: new THREE.Color(0, 0, 0) },
    uEmissiveIntensity: { value: 0.0 },
  },
};

/** Walnut-specific colors */
export const walnutColors = {
  uDarkWood: new THREE.Color(0.25, 0.15, 0.1),
  uLightWood: new THREE.Color(0.45, 0.3, 0.2),
};

/** Oak-specific colors */
export const oakColors = {
  uDarkWood: new THREE.Color(0.5, 0.38, 0.25),
  uLightWood: new THREE.Color(0.7, 0.55, 0.38),
};

/** Bamboo-specific colors */
export const bambooColors = {
  uDarkWood: new THREE.Color(0.7, 0.6, 0.4),
  uLightWood: new THREE.Color(0.9, 0.8, 0.6),
};
