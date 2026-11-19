# longroadsoftware.com

The company site of Long Road Software LLC, served by GitHub Pages from `main` (custom domain in `CNAME`).

Plain static files, no build step (`.nojekyll`):

- `index.html` and `404.html` (GitHub Pages serves `404.html` for missing pages; it is `noindex`)
- `site.css`, `favicon.svg`
- `theme.js`, the light/dark switch in the menu; the site follows the computer's setting until a visitor presses it, and the choice stays in that browser only
- `robots.txt`, `sitemap.xml` and `llms.txt` for search engines and assistants; update `lastmod` in `sitemap.xml` when a page changes
- `images/og-image.png` (1200×630, the preview shown when the site is shared) and `images/logo.png`, drawn by `tools/make_images.swift`
- `images/mediaflowswift-icon.png`, taken from MediaFlowSwift's app icon

The other registered names (`.net`, `.info`, `.store`) forward to `https://longroadsoftware.com/` at the registrar.
