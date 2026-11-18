# Your Brand's Story — Website

Static website, ready to deploy. No build step.

## Files
- `index.html` — the complete website. Styles, scripts, fonts, images and videos are inlined into this one file.
- `assets/` — logo and icon (also inlined; kept for reference/reuse).
- `favicon.png` — browser tab icon.
- `404.html` — sends unknown URLs back to the homepage.
- `robots.txt` — allows search engines.
- `.nojekyll` — required for GitHub Pages.
- `netlify.toml`, `vercel.json` — host configs (caching + headers).

## Deploy
**GitHub Pages:** push this folder's contents to the repo root → Settings → Pages → Source: `main` / root.
**Netlify:** drag this folder onto app.netlify.com/drop.
**Vercel:** `vercel` in this folder, or import the repo (framework: Other, no build command).
**Any host / cPanel:** upload all files to `public_html`.

## Before going live
Booking link, WhatsApp number, email and Instagram are set in the editable source (`YBS Website Live.dc.html` → Tweaks). Re-export `index.html` after changing them.
