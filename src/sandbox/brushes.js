// Alternative brush sheets, in the same layout as oilpaint/brush.js (4 x 2 cells; r = how thick the paint stands,
// g = where there is paint, b = the streak of the second colour), so they can be swapped into shared.tBrush.
//
//   gaussian   every dab is a soft anisotropic blob: the oil-paint pipeline wearing a gaussian-splat footprint
//   card       the bare quad, to see exactly where dabs are, how big, and which way they run
import * as THREE from 'three';
import { BRUSH_COLS, BRUSH_ROWS } from '../oilpaint/brush.js';

const CW = 128, CH = 256;

function sheet(mark) {
  const W = CW * BRUSH_COLS, H = CH * BRUSH_ROWS;
  const data = new Uint8Array(W * H * 4);
  for (let cell = 0; cell < BRUSH_COLS * BRUSH_ROWS; cell++) {
    const cx = cell % BRUSH_COLS, cy = Math.floor(cell / BRUSH_COLS);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const u = ((x + 0.5) / CW) * 2 - 1, v = ((y + 0.5) / CH) * 2 - 1;
        const [h, a, s] = mark(u, v, cell);
        const i = ((cx * CW + x) + (cy * CH + y) * W) * 4;
        data[i] = Math.round(h * 255);
        data[i + 1] = Math.round(a * 255);
        data[i + 2] = Math.round(s * 255);
        data[i + 3] = 255;
      }
    }
  }
  const t = new THREE.DataTexture(data, W, H);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Soft blobs. The dab shader cuts paint below 0.3 and is fully opaque above 0.62, so the falloff sits between. */
export function createGaussianSheet(sharpness = 2.2) {
  return sheet((u, v) => {
    const a = Math.exp(-(u * u + v * v) * sharpness);
    return [a * 0.8, a, 0.5];
  });
}

/** The bare card with a thin margin; the far end is marked darker so the stroke's direction shows. */
export function createCardSheet() {
  return sheet((u, v) => {
    const inside = Math.abs(u) < 0.86 && Math.abs(v) < 0.92;
    return [inside ? 0.5 : 0, inside ? 1 : 0, v > 0.6 ? 0.9 : 0.5];
  });
}
