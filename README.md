# Zephia Eye Studio

Client-side eye-animation studio for Zephia (ball robot, 480×128 px pill-visor LED face).
Design → Animate → Sequence → Simulator. No backend; projects live in localStorage and import/export as JSON.

    npm install
    npm run build && npm run serve     # http://localhost:4173
    npm run dev                        # Vite dev server
    npm run shots                      # Playwright screenshots (needs a built dist/)

`dist/` is relocatable: serve it from any static host, or open `dist/index.html` straight from disk.
Export (header button) writes `zephia.led-frames` v1 JSON: per-frame hex rows (msb-left) plus per-LED brightness 0–255, at the chosen LED resolution.
