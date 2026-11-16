// A meadow with no end, on oilpaint/ground.js: dabs that lie flat, each belonging to one small square of ground for
// good. Two palettes (grass, and whatever grows in patches through it) drift into each other over the ground.
// Modelled on the leaf carpet in the oil-paint demo (src/world/floor.js there).
import * as THREE from 'three';
import { groundRings } from '../oilpaint/ground.js';

const BODY = /* glsl */ `
// in the picture of the still world's shade, ask it; beyond it the meadow is simply in the sun
float stillSunAt(vec3 world) {
  vec4 t = uTreeShadeMat * vec4(world, 1.0);
  if (t.x > 0.0 && t.x < 1.0 && t.y > 0.0 && t.y < 1.0 && t.z < 1.0) return texture(tTreeShade, vec3(t.xy, t.z - uShadeBias));
  return 1.0;
}
void makeDab(inout Dab d) {
  vec2 cell; float sub;
  if (!ringCell(0.0, true, cell, sub)) { d.alive = 0.0; return; }
  vec4 r = hash4(cell, sub * 3.0 + 1.0);
  vec4 q = hash4(cell + 31.7, sub + 11.0);
  vec2 xz = (cell + r.xy) * uCell0;
  float lod;
  d.alive = ringGrow(distance(xz, cameraPosition.xz), lod);
  if (d.alive <= 0.0) return;
  vec3 P = vec3(xz.x, heightAt(xz), xz.y);
  vec3 Nn = normalAt(xz);
  float lit = stillSunAt(P + vec3(0.0, 0.2, 0.0)) * clamp(dot(Nn, uSunDir) * 2.4, 0.0, 1.0);
  float drift = texture(tNoise, xz / uPatch).r * 1.4 + texture(tNoise, xz / (uPatch * 0.27)).g * 0.4 - 0.4;
  float other = step(1.0 - uMix, drift + (q.x - 0.5) * 0.3);
  vec3 c1 = mix(paint3(uGrassL, uGrassM, uGrassS, lit, q.y), paint3(uPatchL, uPatchM, uPatchS, lit, q.y), other);
  float other2 = step(1.0 - uMix, drift + (q.z - 0.5) * 0.6);
  vec3 c2 = mix(paint3(uGrassL, uGrassM, uGrassS, lit, q.w), paint3(uPatchL, uPatchM, uPatchS, lit, q.w), other2);
  c1 = jitter(c1, r.wzy, uGJitter);
  c2 = jitter(c2 * 1.1, q.wzy, uGJitter);
  // strokes of a patch lie much alike
  float a = (texture(tNoise, xz / 6.3).a * 1.2 + q.y * uGTurn) * TAU;
  d.dir = vec3(cos(a), 0.0, sin(a));
  d.pos = P;
  d.size = uCell0 * vec2(1.05 + 0.5 * r.z, 1.7 + 0.9 * r.w) * lod * uGSize;
  d.c1 = hazed(c1, P);
  d.c2 = hazed(c2, P);
  d.seed = dot(cell, vec2(1.0, 57.0)) + sub * 0.37;
  d.turnabout = 1.0;
  d.lie = 1.0;
  d.nrm = Nn;
  d.height = (0.03 + 0.07 * q.z) * pow(lod, 0.35);
  d.glaze = 1.0;
}`;

export function createGround(shared, grass, patch) {
  const uniforms = {
    ...grass.uniforms, ...patch.uniforms,
    uPatch: { value: 17 },   // how large the patches are, metres
    uMix: { value: 0.3 },   // how much of the ground they take
    uGJitter: { value: 0.5 },
    uGTurn: { value: 0.8 },  // how much strokes of a patch turn from each other
    uGSize: { value: 1 },
  };
  const rings = groundRings(shared, {
    head: grass.glsl + patch.glsl + /* glsl */ `uniform float uPatch; uniform float uMix; uniform float uGJitter; uniform float uGTurn; uniform float uGSize;`,
    body: BODY, per: 3, n: 160, cell0: 0.14, levels: 5, minPx: [5, 9], maxPx: [4000, 4000], cells: [0, 8],
  });
  // groundRings takes no uniforms of its own: hand ours to each level's material before it is first drawn
  for (const level of rings.group.children) Object.assign(level.material.uniforms, uniforms);
  return { group: rings.group, follow: rings.follow, uniforms, materials: rings.group.children.map((m) => m.material), dabs: 160 * 160 * 3 * 5 };
}
