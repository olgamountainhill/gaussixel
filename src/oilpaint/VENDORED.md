# Vendored: oil-paint painter core

Source: https://patch.gg/blendi/oil-paint (`git clone https://git.patch.gg/blendi/oil-paint.git`),
commit `804c65f`, directory `src/oilpaint/`. MIT, Copyright (c) 2026 Patch — see `LICENSE` here.

Changes from upstream:

- `shade.js`: the still-world shade bake is wrapped in a function and returned as `rebake()`, so the
  sandbox can move the sun at runtime. Marked `[gaussixel]` in the file.

Everything else is byte-for-byte upstream. Sandbox-only code lives in `src/sandbox/`.
