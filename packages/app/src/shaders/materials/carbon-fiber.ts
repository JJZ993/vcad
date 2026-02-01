/**
 * Carbon Fiber Shader - Woven pattern with subtle metallic sheen.
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

uniform vec3 uFiberColor;
uniform vec3 uResinColor;
uniform float uWeaveScale;
uniform float uWeaveContrast;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Weave pattern - creates interlocking grid
float weavePattern(vec2 uv) {
  vec2 scaled = uv * uWeaveScale;

  // Create checker pattern for over/under weave
  float checker = step(0.5, fract(scaled.x)) * step(0.5, fract(scaled.y)) +
                  step(0.5, fract(scaled.x + 0.5)) * step(0.5, fract(scaled.y + 0.5));

  // Create the fiber direction
  float fiberX = sin(scaled.x * 3.14159 * 2.0);
  float fiberY = sin(scaled.y * 3.14159 * 2.0);

  // Combine into weave with depth effect
  float weave = mix(abs(fiberX), abs(fiberY), checker);

  // Add subtle noise for fiber texture
  float noise = snoise(vec3(scaled * 4.0, 0.0)) * 0.1;

  return clamp(weave + noise, 0.0, 1.0);
}

void main() {
  // Triplanar blend
  vec3 blend = triplanarBlend(vWorldNormal);

  // Sample weave from each axis
  float patternX = weavePattern(vWorldPosition.yz);
  float patternY = weavePattern(vWorldPosition.xz);
  float patternZ = weavePattern(vWorldPosition.xy);

  float pattern = triplanarSample(patternX, patternY, patternZ, blend);

  // Enhance contrast
  pattern = pow(pattern, uWeaveContrast);

  // Mix fiber and resin colors
  vec3 color = mix(uResinColor, uFiberColor, pattern);

  // Lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
  float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
  float ambient = 0.25;

  // Carbon fiber has directional sheen
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);

  // Anisotropic-ish specular based on weave direction
  float spec = pow(max(dot(vWorldNormal, halfDir), 0.0), 32.0);
  spec *= 0.4 + pattern * 0.3; // Varies with weave

  vec3 finalColor = color * (ambient + diffuse * 0.75) + vec3(spec * 0.3);

  // Add emissive
  finalColor += uEmissive * uEmissiveIntensity;

  gl_FragColor = vec4(finalColor, 1.0);

  #include <logdepthbuf_fragment>
}
`;

export const carbonFiberShader: ProceduralShaderDef = {
  key: "carbon-fiber",
  vertexShader,
  fragmentShader,
  uniforms: {
    uFiberColor: { value: new THREE.Color(0.08, 0.08, 0.1) },
    uResinColor: { value: new THREE.Color(0.15, 0.15, 0.18) },
    uWeaveScale: { value: 40.0 },
    uWeaveContrast: { value: 1.2 },
    uEmissive: { value: new THREE.Color(0, 0, 0) },
    uEmissiveIntensity: { value: 0.0 },
  },
};
