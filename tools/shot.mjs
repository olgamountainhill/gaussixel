// A headless still of the sandbox, for checking a change without a browser to hand.
//   npm run build && node tools/shot.mjs [out.png] [--query "brush=gaussian&subject=teapot"] [--size 1280x720]
// Serves dist/ itself. Set CHROME to a Chromium of your own if Playwright has none.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const query = flag('query', '');
const [width, height] = flag('size', '1280x720').split('x').map(Number);
const out = args[0] ?? 'shots/sandbox.png';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('No dist/: run `npm run build` first.'); process.exit(1); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, ''));
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(target)] ?? 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(String(e)));
await page.goto(`http://127.0.0.1:${server.address().port}/?clean&capture&${query}`);
await page.waitForFunction(() => window.sandbox?.ready, null, { timeout: 120000 });
// a few frames, so every shader is built and the moving shadow has been drawn; then the canvas itself
const png = await page.evaluate(() => {
  for (let i = 0; i < 4; i++) window.sandbox.tick(1 / 30);
  return window.sandbox.renderer.domElement.toDataURL('image/png');
});
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
await browser.close();
server.close();
for (const p of problems) console.warn('page:', p);
console.log(`${out}  ${width}x${height}${problems.length ? `  (${problems.length} console problems)` : ''}`);
