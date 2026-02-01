/**
 * Brushed Metal Shader - Anisotropic streaks for aluminum, steel, etc.
 * Uses directional noise to simulate machining marks.
 */

import * as THREE from "three";
import { noiseChunk } from "../chunks/noise.glsl";
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
${triplanarChunk}

uniform vec3 uBaseColor;
uniform float uMetalness;
uniform float uRoughness;
uniform float uStreakIntensity;
uniform float uStreakScale;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Brushed effect along one axis with noise variation
float brushedPattern(vec2 uv) {
  // Primary streak direction with high frequency
  float streak = snoise(vec3(uv.x * uStreakScale, uv.y * 2.0, 0.0));

  // Add finer detail streaks
  float fineStreak = snoise(vec3(uv.x * uStreakScale * 3.0, uv.y * 4.0, 1.0)) * 0.3;

  // Combine for realistic brushed look
  return (streak + fineStreak) * uStreakIntensity;
}

void main() {
  // Triplanar blend for seamless projection
  vec3 blend = triplanarBlend(vWorldNormal);

  // Sample brushed pattern from each axis
  float patternX = brushedPattern(vWorldPosition.yz);
  float patternY = brushedPattern(vWorldPosition.xz);
  float patternZ = brushedPattern(vWorldPosition.xy);

  float pattern = triplanarSample(patternX, patternY, patternZ, blend);

  // Apply subtle color variation
  vec3 color = uBaseColor + vec3(pattern * 0.03);

  // Roughness variation based on streak direction
  float roughnessVar = uRoughness + pattern * 0.08;

  // Simple lighting approximation (will be improved with proper PBR)
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
  float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
  float ambient = 0.3;

  // Anisotropic highlight simulation
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(vWorldNormal, halfDir), 0.0), mix(16.0, 64.0, 1.0 - roughnessVar));

  // Metallic reflection
  vec3 reflectColor = uBaseColor * spec * uMetalness;

  // Final color
  vec3 finalColor = color * (ambient + diffuse * 0.7) + reflectColor;

  // Add emissive
  finalColor += uEmissive * uEmissiveIntensity;

  gl_FragColor = vec4(finalColor, 1.0);

  #include <logdepthbuf_fragment>
}
`;

export const brushedMetalShader: ProceduralShaderDef = {
  key: "brushed-metal",
  vertexShader,
  fragmentShader,
  uniforms: {
    uBaseColor: { value: new THREE.Color(0.8, 0.8, 0.85) },
    uMetalness: { value: 0.9 },
    uRoughness: { value: 0.3 },
    uStreakIntensity: { value: 0.5 },
    uStreakScale: { value: 80.0 },
    uEmissive: { value: new THREE.Color(0, 0, 0) },
    uEmissiveIntensity: { value: 0.0 },
  },
};
