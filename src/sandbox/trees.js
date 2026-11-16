// A few trees: the example of dabs of your own. Trunks are real shapes painted with surface dabs along the grain.
// A crown is a handful of blobs; every leaf mass is one dab hung in a blob's shell, lit by which way that part of
// the blob faces, swaying in the wind's gusts. Inside each blob is a darker one: the underpainting, and what
// throws the crown's shade.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { surfaceDabs, underpaintMaterial } from './surface.js';
import { rng } from './palette.js';

const LEAF = /* glsl */ `
void makeDab(inout Dab d) {
  vec4 r = hash4(aLeaf.w);
  vec3 Nn = normalize(aOut.xyz);
  float gust = gustAt(aLeaf.xz);
  float sway = sin(uTime * (1.6 + 2.0 * r.z) + r.w * 40.0) * (0.03 + 0.12 * gust) * uSway;
  vec3 wind = vec3(uWind.x, 0.0, uWind.y);
  vec3 P = aLeaf.xyz + wind * sway + vec3(0.0, sway * 0.3, 0.0);
  // pushed out of its own blob before it asks about the shade, so a crown is shaded by its neighbours, not itself
  float lit = sunAt(aLeaf.xyz + Nn * aOut.w) * clamp(dot(Nn, uSunDir) * 0.7 + 0.5, 0.0, 1.0);
  vec3 c = paint3(uLeafL, uLeafM, uLeafS, lit, r.x);
  c = mix(c, c * vec3(0.86, 0.92, 1.18), (1.0 - lit) * max(Nn.y, 0.0) * 0.5);
  c = jitter(c, r.yzw, uLeafJitter);
  d.pos = P;
  // leaves hang, each a little its own way, and stream with the gusts
  d.dir = normalize(vec3(r.x - 0.5, -0.5 - r.y, r.z - 0.5) + Nn * 0.5 + wind * (gust * 0.8 + sway * 4.0));
  d.size = uLeafSize * (0.7 + 0.6 * r.w);
  d.c1 = hazed(c, P);
  d.c2 = hazed(jitter(c * 1.25, r.wxy, 0.6), P);
  d.seed = aLeaf.w;
  d.lift = 0.5;
  d.turnabout = 1.0;
}`;

export function createTrees(shared, bark, leaf, { spots = [[-5.5, -4.5, 1.0], [4.8, -6.5, 1.25], [-1.0, -11.0, 0.9], [9.5, -1.5, 0.8]], max = 60000 } = {}) {
  const rand = rng(2024);
  const trunks = [], blobs = [];
  for (const [x, z, k] of spots) {
    const h = 3.4 * k;
    trunks.push(new THREE.CylinderGeometry(0.16 * k, 0.3 * k, h, 10, 6).translate(x, h / 2, z).toNonIndexed());
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, out = (i === 0 ? 0 : 0.7 + rand() * 1.0) * k;
      blobs.push({ c: new THREE.Vector3(x + Math.cos(a) * out, h + (0.2 + rand() * 1.5) * k, z + Math.sin(a) * out), r: new THREE.Vector3(1.0 + rand() * 0.7, 0.8 + rand() * 0.5, 1.0 + rand() * 0.7).multiplyScalar(k) });
    }
  }
  const trunkGeometry = mergeGeometries(trunks);
  const blobGeometry = mergeGeometries(blobs.map((b) => new THREE.IcosahedronGeometry(1, 2).scale(b.r.x * 0.8, b.r.y * 0.8, b.r.z * 0.8).translate(b.c.x, b.c.y, b.c.z)));

  // leaves: more to the larger blobs, in a shell just inside the surface
  const aLeaf = new Float32Array(max * 4), aOut = new Float32Array(max * 4);
  const areas = blobs.map((b) => b.r.x * b.r.y * b.r.z);
  const total = areas.reduce((s, a) => s + a, 0);
  for (let i = 0; i < max; i++) {
    let want = rand() * total, k = 0;
    while (k < blobs.length - 1 && (want -= areas[k]) > 0) k++;
    const b = blobs[k];
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u), shell = 0.78 + 0.3 * rand();
    const nx = s * Math.cos(a), ny = u, nz = s * Math.sin(a);
    aLeaf.set([b.c.x + nx * b.r.x * shell, b.c.y + ny * b.r.y * shell, b.c.z + nz * b.r.z * shell, rand() * 1000], i * 4);
    aOut.set([nx / b.r.x, ny / b.r.y, nz / b.r.z, 0.5 * Math.min(b.r.x, b.r.y, b.r.z)], i * 4);
  }
  const uniforms = { ...leaf.uniforms, uLeafSize: { value: new THREE.Vector2(0.22, 0.34) }, uLeafJitter: { value: 0.6 }, uSway: { value: 1 } };
  const leafGeometry = dabGeometry(max, { aLeaf: [aLeaf, 4], aOut: [aOut, 4] });
  const leaves = dabMesh(leafGeometry, dabMaterial(shared, {
    head: leaf.glsl + /* glsl */ `in vec4 aLeaf; in vec4 aOut; uniform vec2 uLeafSize; uniform float uLeafJitter; uniform float uSway;`,
    body: LEAF, uniforms, minPx: [4, 6], maxPx: [300, 500], cells: [0, 8],
  }), 4);

  const trunkDabs = surfaceDabs(shared, trunkGeometry, { pal: bark, max: 6000, size: [0.1, 0.42], minPx: [3, 8], seed: 77 });
  trunkDabs.uniforms.uGrainLoose.value = 0.08;

  const group = new THREE.Group();
  const under = new THREE.Group();
  under.add(new THREE.Mesh(trunkGeometry, underpaintMaterial(shared, bark)), new THREE.Mesh(blobGeometry, underpaintMaterial(shared, leaf, { strength: 0.7 })));
  group.add(under, trunkDabs.mesh, leaves);

  // what stands still and throws shade: handed to createShade
  const caster = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const shade = new THREE.Group();
  shade.add(new THREE.Mesh(trunkGeometry, caster), new THREE.Mesh(blobGeometry, caster));

  return {
    group, under, leaves, trunkDabs, shade, uniforms, max,
    setCount(k) { leafGeometry.instanceCount = Math.max(0, Math.min(max, Math.round(k))); },
  };
}
