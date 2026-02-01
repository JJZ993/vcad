/**
 * Concrete Shader - Porous, speckled surface with aggregate.
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

uniform vec3 uBaseColor;
uniform vec3 uAggregateColor;
uniform float uPoreScale;
uniform float uAggregateScale;
uniform float uRoughness;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Concrete surface pattern
vec3 concretePattern(vec3 pos) {
  // Base surface variation with FBM
  float surface = fbm(pos * uPoreScale) * 0.15;

  // Pores/voids (cellular noise approximation)
  float pores = 1.0 - smoothstep(0.0, 0.3, snoise(pos * uPoreScale * 2.0) + 0.5);

  // Aggregate particles (larger stones)
  float aggregate = smoothstep(0.4, 0.6, snoise(pos * uAggregateScale));

  // Fine sand texture
  float sand = snoise(pos * uPoreScale * 5.0) * 0.05;

  // Combine surface features
  float brightness = 1.0 + surface - pores * 0.15 + sand;

  return vec3(brightness, aggregate, pores);
}

void main() {
  // Triplanar blend
  vec3 blend = triplanarBlend(vWorldNormal);

  // Sample from each axis
  vec3 patternX = concretePattern(vec3(vWorldPosition.yz, 0.0));
  vec3 patternY = concretePattern(vec3(vWorldPosition.xz, 1.0));
  vec3 patternZ = concretePattern(vec3(vWorldPosition.xy, 2.0));

  vec3 pattern = triplanarSampleVec3(patternX, patternY, patternZ, blend);

  // Unpack pattern components
  float brightness = pattern.x;
  float aggregate = pattern.y;
  float pores = pattern.z;

  // Mix colors
  vec3 color = uBaseColor * brightness;
  color = mix(color, uAggregateColor, aggregate * 0.4);

  // Darken pores slightly
  color *= 1.0 - pores * 0.1;

  // Lighting - concrete is matte
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
  float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
  float ambient = 0.4;

  // Very subtle specular for slightly wet/polished concrete
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(vWorldNormal, halfDir), 0.0), 8.0) * 0.05 * (1.0 - uRoughness);

  vec3 finalColor = color * (ambient + diffuse * 0.6) + vec3(spec);

  // Add emissive
  finalColor += uEmissive * uEmissiveIntensity;

  gl_FragColor = vec4(finalColor, 1.0);

  #include <logdepthbuf_fragment>
}
`;

export const concreteShader: ProceduralShaderDef = {
  key: "concrete",
  vertexShader,
  fragmentShader,
  uniforms: {
    uBaseColor: { value: new THREE.Color(0.6, 0.6, 0.58) },
    uAggregateColor: { value: new THREE.Color(0.5, 0.5, 0.48) },
    uPoreScale: { value: 3.0 },
    uAggregateScale: { value: 1.5 },
    uRoughness: { value: 0.85 },
    uEmissive: { value: new THREE.Color(0, 0, 0) },
    uEmissiveIntensity: { value: 0.0 },
  },
};
