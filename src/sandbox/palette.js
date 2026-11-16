// A palette is the painter's three mixes (light, half-tone, shade) as live uniforms, so the GUI can remix them
// while the picture is up. Colours are paint: plain numbers written to the canvas as they are.
import * as THREE from 'three';

export function palette(prefix, [light, half, shade]) {
  const colors = { light: new THREE.Color(...light), half: new THREE.Color(...half), shade: new THREE.Color(...shade) };
  return {
    colors,
    uniforms: { [`${prefix}L`]: { value: colors.light }, [`${prefix}M`]: { value: colors.half }, [`${prefix}S`]: { value: colors.shade } },
    glsl: `uniform vec3 ${prefix}L; uniform vec3 ${prefix}M; uniform vec3 ${prefix}S;\n`,
  };
}

/** A seeded random, so the sandbox lays the same strokes every load. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
