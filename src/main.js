// The sandbox: a small still life painted with the oil-paint dab technique (src/oilpaint, from
// https://patch.gg/blendi/oil-paint), with everything worth turning on a panel.
//
//   a subject   surface dabs on a shape you choose or a .glb you drop; it turns, so its shadow is the moving glaze
//   trees       dabs of your own: leaf masses hung in blobs, trunks painted along the grain
//   a meadow    the endless ground: dabs that lie flat and never shift
//   the sky     a wash and broad strokes
//
// URL: ?brush=bristle|gaussian|card  ?subject=knot|teapot|sphere|box|none  ?still (no spin)  ?clean (no panels)  ?capture (no clock)
import * as THREE from 'three';
import GUI from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { createShared, createBrushSheet, createShade, createFrame } from './oilpaint/index.js';
import { createGaussianSheet, createCardSheet } from './sandbox/brushes.js';
import { palette } from './sandbox/palette.js';
import { surfaceDabs, underpaintMaterial, flatten } from './sandbox/surface.js';
import { createGround } from './sandbox/ground.js';
import { createSky } from './sandbox/sky.js';
import { createTrees } from './sandbox/trees.js';

const q = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are paint: written as they are
document.getElementById('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.2, 2000);
camera.position.set(5.2, 2.3, 8.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, -1);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1;
controls.maxDistance = 120;

// --- what every dab reads ---
const shared = createShared();
const brushes = { bristle: createBrushSheet(), gaussian: createGaussianSheet(), card: createCardSheet() };
const sun = new THREE.Vector3();

const state = {
  brush: brushes[q.get('brush')] ? q.get('brush') : 'bristle',
  subject: q.get('subject') ?? 'knot',
  spin: q.has('still') ? 0 : 0.25,
  subjectDabs: 9000,
  leafDabs: 42000,
  sunAzimuth: -58,
  sunElevation: 36,
  pixelRatio: Math.min(devicePixelRatio, 1.5),
};
shared.tBrush.value = brushes[state.brush];

// --- palettes: light, half-tone, shade ---
const pals = {
  subject: palette('uSubj', [[0.93, 0.36, 0.2], [0.62, 0.17, 0.16], [0.25, 0.1, 0.2]]),
  grass: palette('uGrass', [[0.62, 0.74, 0.3], [0.4, 0.5, 0.2], [0.14, 0.24, 0.2]]),
  patch: palette('uPatch', [[0.97, 0.78, 0.3], [0.72, 0.5, 0.18], [0.3, 0.22, 0.2]]),
  bark: palette('uBark', [[0.66, 0.52, 0.4], [0.38, 0.28, 0.24], [0.16, 0.13, 0.17]]),
  leaf: palette('uLeaf', [[0.98, 0.66, 0.18], [0.74, 0.36, 0.12], [0.32, 0.16, 0.17]]),
};

// --- the world ---
const sky = createSky(shared);
const ground = createGround(shared, pals.grass, pals.patch);
const earth = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2).translate(0, -0.02, 0), underpaintMaterial(shared, pals.grass, { strength: 0.8 }));
const trees = createTrees(shared, pals.bark, pals.leaf);
trees.setCount(state.leafDabs);

// the subject: its faces (underpainting), a copy seen only by the moving shadow's camera (layer 1), and its dabs
const SUBJECTS = {
  knot: () => new THREE.TorusKnotGeometry(0.85, 0.3, 200, 28).translate(0, 1.6, 0),
  teapot: () => new TeapotGeometry(0.9, 10).translate(0, 0.9, 0),
  sphere: () => new THREE.SphereGeometry(1.1, 48, 32).translate(0, 1.1, 0),
  box: () => new THREE.BoxGeometry(1.7, 1.7, 1.7).translate(0, 0.85, 0),
};
const subject = new THREE.Group();
const subjectUnder = new THREE.Mesh(new THREE.BufferGeometry(), underpaintMaterial(shared, pals.subject));
const subjectCaster = new THREE.Mesh(subjectUnder.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
subjectCaster.layers.set(1);
subject.add(subjectUnder, subjectCaster);
const subjectPaint = surfaceDabs(shared, new THREE.SphereGeometry(1), { pal: pals.subject, max: 40000, count: state.subjectDabs, model: subject.matrixWorld });

function setSubject(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  subjectUnder.geometry.dispose();
  subjectUnder.geometry = subjectCaster.geometry = g;
  subjectPaint.setGeometry(g);
}
function chooseSubject(name) {
  subject.visible = subjectPaint.mesh.visible = name !== 'none';
  if (SUBJECTS[name]) setSubject(SUBJECTS[name]());
}
chooseSubject(SUBJECTS[state.subject] || state.subject === 'none' ? state.subject : 'knot');

scene.add(sky.group, earth, ground.group, trees.group, subject, subjectPaint.mesh);

// --- shade: the still world once (and again when the sun moves), the subject's shadow each frame ---
const still = new THREE.Scene();
still.add(trees.shade);
function aimSun() {
  const az = THREE.MathUtils.degToRad(state.sunAzimuth), el = THREE.MathUtils.degToRad(state.sunElevation);
  sun.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  shared.uSunDir.value.copy(sun);
}
aimSun();
shared.uShadeBias.value = 0.0012;
const shade = createShade(renderer, shared, still, { sun, size: [2048, 2048], box: [34, 34], centre: [0, 3, -4], back: 120, near: 60, far: 180 });
const frame = createFrame(renderer, shared);
frame.uniforms.uShafts.value = 0.25;

// --- the panel ---
const gui = new GUI({ title: 'dab sandbox' });
const dabMaterials = { subject: subjectPaint.material, leaves: trees.leaves.material, trunks: trees.trunkDabs.material };

const fBrush = gui.addFolder('Brush');
fBrush.add(state, 'brush', Object.keys(brushes)).name('marks').onChange((v) => { shared.tBrush.value = brushes[v]; });
fBrush.add(shared.uImpasto, 'value', 0, 2.5, 0.01).name('impasto');
fBrush.add(frame.uniforms.uCanvas, 'value', 0, 3, 0.01).name('canvas weave');

const fLight = gui.addFolder('Light and air');
const resun = () => { aimSun(); shade.rebake(); };
fLight.add(state, 'sunAzimuth', -180, 180, 1).name('sun azimuth').onChange(resun);
fLight.add(state, 'sunElevation', 4, 85, 1).name('sun elevation').onChange(resun);
fLight.add(shared.uHazeDensity, 'value', 0, 0.06, 0.0005).name('mist');
fLight.addColor(shared.uHaze, 'value').name('mist colour');
fLight.addColor(shared.uHazeSun, 'value').name('mist toward sun');
fLight.add(frame.uniforms.uShafts, 'value', 0, 1.5, 0.01).name('sun in the mist');
fLight.add(shared.uWind.value, 'z', 0, 3, 0.01).name('wind');
fLight.addColor(sky.uniforms.uZenith, 'value').name('zenith');
fLight.addColor(shared.uGlazeMul, 'value').name('shadow glaze');
fLight.close();

function paletteFolder(parent, name, pal) {
  const f = parent.addFolder(name);
  f.addColor(pal.colors, 'light');
  f.addColor(pal.colors, 'half').name('half-tone');
  f.addColor(pal.colors, 'shade');
  return f;
}
function sizeControls(f, material, label = 'size') {
  const u = material.uniforms;
  if (u.uSize) { f.add(u.uSize.value, 'x', 0.01, 0.6, 0.005).name(`${label} across (m)`); f.add(u.uSize.value, 'y', 0.01, 1.2, 0.005).name(`${label} along (m)`); }
  f.add(u.uMinPx.value, 'x', 0, 30, 0.5).name('least across (px)');
  f.add(u.uMinPx.value, 'y', 0, 60, 0.5).name('least along (px)');
  f.add(u.uMaxPx.value, 'y', 10, 1200, 5).name('most along (px)');
}

const fSubject = gui.addFolder('Subject');
fSubject.add(state, 'subject', [...Object.keys(SUBJECTS), 'none']).onChange(chooseSubject).listen();
fSubject.add(state, 'spin', -2, 2, 0.01).name('spin (rad/s)');
fSubject.add(state, 'subjectDabs', 0, subjectPaint.max, 100).name('dabs').onChange((v) => subjectPaint.setCount(v));
sizeControls(fSubject, subjectPaint.material);
fSubject.add(subjectPaint.uniforms.uGrain, 'value', { 'along the axis': 0, 'round the axis': 1, 'any way': 2 }).name('grain');
fSubject.add(subjectPaint.uniforms.uGrainLoose, 'value', 0, 1, 0.01).name('grain looseness');
fSubject.add(subjectPaint.uniforms.uJitter, 'value', 0, 2, 0.01).name('broken colour');
fSubject.add(subjectPaint.uniforms.uStreak, 'value', 0.5, 2, 0.01).name('streak');
fSubject.add(subjectPaint.uniforms.uLift, 'value', 0, 2, 0.01).name('lift');
fSubject.add(subjectUnder, 'visible').name('underpainting');
fSubject.add(subjectPaint.mesh, 'visible').name('strokes').listen();
paletteFolder(fSubject, 'Palette', pals.subject);

const fTrees = gui.addFolder('Trees');
fTrees.add(trees.group, 'visible').name('show');
fTrees.add(state, 'leafDabs', 0, trees.max, 500).name('leaf dabs').onChange((v) => trees.setCount(v));
fTrees.add(trees.uniforms.uLeafSize.value, 'x', 0.02, 1, 0.005).name('leaf across (m)');
fTrees.add(trees.uniforms.uLeafSize.value, 'y', 0.02, 1.5, 0.005).name('leaf along (m)');
fTrees.add(trees.uniforms.uLeafJitter, 'value', 0, 2, 0.01).name('broken colour');
fTrees.add(trees.uniforms.uSway, 'value', 0, 4, 0.01).name('sway');
fTrees.add(trees.under, 'visible').name('underpainting');
paletteFolder(fTrees, 'Leaves', pals.leaf).close();
paletteFolder(fTrees, 'Bark', pals.bark).close();
fTrees.close();

const fGround = gui.addFolder('Ground');
fGround.add(ground.group, 'visible').name('strokes');
fGround.add(ground.uniforms.uGSize, 'value', 0.3, 3, 0.01).name('stroke size');
fGround.add(ground.uniforms.uGTurn, 'value', 0, 3, 0.01).name('stroke turn');
fGround.add(ground.uniforms.uGJitter, 'value', 0, 2, 0.01).name('broken colour');
fGround.add(ground.uniforms.uPatch, 'value', 2, 80, 0.5).name('patch size (m)');
fGround.add(ground.uniforms.uMix, 'value', 0, 1, 0.01).name('patch amount');
paletteFolder(fGround, 'Grass', pals.grass).close();
paletteFolder(fGround, 'Patches', pals.patch).close();
fGround.close();

const fView = gui.addFolder('View');
fView.add(camera, 'fov', 15, 90, 1).onChange(() => camera.updateProjectionMatrix());
fView.add(state, 'pixelRatio', 0.5, 2, 0.05).name('pixel ratio').onFinishChange(fit);
fView.add({ png() { tick(0); renderer.domElement.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'gaussixel.png'; a.click(); }); } }, 'png').name('save PNG');
fView.add({ copy() { navigator.clipboard?.writeText(JSON.stringify(gui.save(), null, 2)); } }, 'copy').name('copy settings (JSON)');
fView.close();

// --- a model of your own: drop a .glb on the page ---
const loader = new GLTFLoader();
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drop'); });
addEventListener('dragleave', () => document.body.classList.remove('drop'));
addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('drop');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(url);
    const g = flatten(gltf.scene);
    if (!g) return;
    // stood on the ground, about two metres across its largest side (textures are ignored: colour is the palette)
    g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3()), mid = g.boundingBox.getCenter(new THREE.Vector3());
    const k = 2.2 / Math.max(size.x, size.y, size.z);
    g.translate(-mid.x, -g.boundingBox.min.y, -mid.z).scale(k, k, k);
    state.subject = 'dropped';
    subject.visible = subjectPaint.mesh.visible = true;
    setSubject(g);
  } catch (err) {
    console.error('Could not read that model', err);
  } finally {
    URL.revokeObjectURL(url);
  }
});
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyH' || e.target.tagName === 'INPUT') return;
  const off = gui._hidden;
  gui.show(off);
  for (const id of ['stats', 'hint']) document.getElementById(id).style.display = off ? '' : 'none';
});
if (q.has('clean')) { gui.hide(); for (const id of ['stats', 'hint']) document.getElementById(id).style.display = 'none'; }

// --- the loop ---
function fit() {
  renderer.setPixelRatio(state.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  frame.resize();
}
addEventListener('resize', fit);

const stats = document.getElementById('stats');
const size = new THREE.Vector2();
const centre = new THREE.Vector3();
let time = 0, last = performance.now(), smooth = 16, shown = 0;
function tick(dt) {
  time += dt;
  controls.update();
  subject.rotation.y += state.spin * dt;
  subject.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  renderer.getDrawingBufferSize(size);
  shared.uTime.value = time;
  shared.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / size.y;
  shared.uFocus.value.set(controls.target.x, 0, controls.target.z);
  ground.follow(camera.position.x, camera.position.z);
  shade.update(scene, centre.setFromMatrixPosition(subject.matrixWorld));
  frame.render(scene, camera);
}
// ?capture: no clock; window.sandbox.tick(dt) draws a frame (tools/shot.mjs)
if (!q.has('capture')) renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 1 / 20);
  smooth += ((now - last) - smooth) * 0.05;
  last = now;
  tick(dt);
  if (now - shown > 500) {
    shown = now;
    const dabs = (subjectPaint.mesh.visible ? state.subjectDabs : 0) + (trees.group.visible ? state.leafDabs + trees.trunkDabs.max : 0) + (ground.group.visible ? ground.dabs : 0) + sky.dabs;
    stats.textContent = `${smooth.toFixed(1)} ms  ${(1000 / smooth).toFixed(0)} fps\n${(dabs / 1000).toFixed(0)}k dabs  ${size.x}x${size.y}`;
  }
});

// for the console and for tools/shot.mjs
window.sandbox = { THREE, renderer, scene, camera, controls, shared, frame, shade, gui, state, pals, subjectPaint, trees, ground, sky, dabMaterials, tick, ready: true };
