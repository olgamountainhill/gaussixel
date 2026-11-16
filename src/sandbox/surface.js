// Paint on a surface: dabs scattered evenly over a geometry, each lit by where it sits, each run along a grain.
// It is the sandbox's version of oilpaint/pins.js with everything worth playing with as a live uniform (pins.js
// bakes its palettes into the shader and moves pins on the CPU so that it can follow a skinned mesh; this one
// carries a rigid `model` matrix on the GPU instead, so a spinning or dragged thing costs nothing).
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMMON } from '../oilpaint/common.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { rng } from './palette.js';

const BODY = /* glsl */ `
void makeDab(inout Dab d) {
  vec3 P = (uModel * vec4(aPos, 1.0)).xyz;
  vec3 Nn = normalize(mat3(uModel) * aNrm);
  // the far side of the thing is not ours to paint
  if (dot(Nn, normalize(cameraPosition - P)) < -0.15) { d.alive = 0.0; return; }
  vec4 r = hash4(aSeed);
  float lit = sunAt(P + Nn * 0.08) * clamp(dot(Nn, uSunDir) * 0.85 + 0.42, 0.0, 1.0);
  vec3 c = paint3(uSurfL, uSurfM, uSurfS, lit, r.x);
  // warm light thrown up by the ground, cool light from the sky into the shade
  c += uBounce * max(-Nn.y, 0.0) * (1.0 - lit);
  c = mix(c, c * vec3(0.86, 0.92, 1.18), (1.0 - lit) * max(Nn.y, 0.0) * 0.6);
  c = jitter(c, r.yzw, uJitter);
  c += uSurfL * uLampCol * lampAt(P, Nn);
  // the grain: 0 runs along the axis (down a trunk), 1 runs round it (hoops of a barrel), 2 any way at all
  vec3 axis = normalize(mat3(uModel) * uGrainAxis);
  vec3 round_ = cross(Nn, axis);
  vec3 any = cross(Nn, normalize(r.xyz - 0.5 + 1e-3));
  if (dot(round_, round_) < 1e-4) round_ = any;
  vec3 dir = uGrain < 0.5 ? cross(round_, Nn) : uGrain < 1.5 ? round_ : any;
  dir = normalize(mix(normalize(dir), normalize(any), uGrainLoose * r.w));
  d.pos = P;
  d.dir = dir;
  d.size = uSize * (0.8 + 0.45 * r.y);
  d.c1 = hazed(c, P);
  d.c2 = hazed(jitter(c * uStreak, r.wxy, uJitter), P);
  d.seed = aSeed;
  d.lift = uLift;
  d.turnabout = 1.0;
}`;

/** Any object's meshes as one geometry of positions and normals, in the object's own space. */
export function flatten(object) {
  object.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(object.matrixWorld).invert();
  const parts = [];
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes.position) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const bare = new THREE.BufferGeometry();
    bare.setAttribute('position', g.attributes.position.clone());
    bare.setAttribute('normal', g.attributes.normal.clone());
    bare.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    parts.push(bare);
  });
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : mergeGeometries(parts);
}

/**
 * `max` dabs are laid over `geometry` in a random order, so `setCount` thins or thickens the paint evenly without
 * laying it again. `model` is a Matrix4 kept by reference (give a mesh's matrixWorld and the paint follows it).
 */
export function surfaceDabs(shared, geometry, { pal, max = 20000, count = max, size = [0.09, 0.2], model = new THREE.Matrix4(), order = 5, minPx = [2.5, 4], maxPx = [200, 400], cells = [0, 6], seed = 4711 } = {}) {
  const aPos = new Float32Array(max * 3), aNrm = new Float32Array(max * 3), aSeed = new Float32Array(max);
  const dabGeo = dabGeometry(count, { aPos: [aPos, 3], aNrm: [aNrm, 3], aSeed: [aSeed, 1] }, true);
  const uniforms = {
    uModel: { value: model },
    uSize: { value: new THREE.Vector2(...size) },
    uJitter: { value: 0.45 },
    uStreak: { value: 1.22 },
    uLift: { value: 0.3 },
    uGrain: { value: 0 },
    uGrainAxis: { value: new THREE.Vector3(0, 1, 0) },
    uGrainLoose: { value: 0.25 },
  };
  const material = dabMaterial(shared, {
    head: /* glsl */ `
      in vec3 aPos; in vec3 aNrm; in float aSeed;
      uniform mat4 uModel; uniform vec2 uSize; uniform float uJitter; uniform float uStreak; uniform float uLift;
      uniform float uGrain; uniform vec3 uGrainAxis; uniform float uGrainLoose;
      uniform vec3 uSurfL; uniform vec3 uSurfM; uniform vec3 uSurfS;`,
    body: BODY,
    uniforms: { ...uniforms, uSurfL: { value: pal.colors.light }, uSurfM: { value: pal.colors.half }, uSurfS: { value: pal.colors.shade } },
    minPx, maxPx, cells,
  });
  const mesh = dabMesh(dabGeo, material, order);

  const p = new THREE.Vector3(), n = new THREE.Vector3();
  function lay(g) {
    const rand = rng(seed);
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(g)).setRandomGenerator(rand).build();
    for (let i = 0; i < max; i++) {
      sampler.sample(p, n);
      aPos.set([p.x, p.y, p.z], i * 3);
      aNrm.set([n.x, n.y, n.z], i * 3);
      aSeed[i] = rand() * 1000;
    }
    for (const name of ['aPos', 'aNrm', 'aSeed']) dabGeo.attributes[name].needsUpdate = true;
  }
  lay(geometry);

  return {
    mesh,
    material,
    uniforms: material.uniforms,
    max,
    setGeometry: lay,
    setCount(k) { dabGeo.instanceCount = Math.max(0, Math.min(max, Math.round(k))); },
  };
}

/**
 * The underpainting: the thing's own faces in its darker mixes, so the gaps between strokes show paint and not sky.
 * It also gives the picture its depth, which the dabs are tested against.
 */
export function underpaintMaterial(shared, pal, { strength = 0.85 } = {}) {
  const [, name] = pal.glsl.match(/uniform vec3 (\w+)L;/);
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...shared, ...pal.uniforms, uUnder: { value: strength } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      out vec3 vN; out vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = mat3(modelMatrix) * normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${pal.glsl}
      uniform float uUnder;
      in vec3 vN; in vec3 vW;
      layout(location = 0) out vec4 outC;
      void main() {
        vec3 Nn = normalize(vN);
        if (!gl_FrontFacing) Nn = -Nn;
        float lit = clamp(dot(Nn, uSunDir) * 0.85 + 0.42, 0.0, 1.0);
        vec3 c = mix(${name}S, ${name}M, smoothstep(0.3, 0.65, lit)) * uUnder;
        outC = vec4(hazed(c, vW), 1.0);
      }`,
  });
}
