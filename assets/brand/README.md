# Notes logo

`notes-logo.png` is the transparent master created with the built-in imagegen tool on 2026-10-06. `public/logo.png` and the desktop PNG/ICO/ICNS files in `src-tauri/icons` are generated from the same master. The web asset is included in the desktop frontend bundle; the ICO is embedded by Tauri in the Windows application and installer.

Design prompt: an original minimal Notes notebook icon, a cream paper glyph with three charcoal writing lines, a folded corner and an integrated warm amber bookmark, centered on a charcoal rounded square; readable at small sizes, no lettering or watermark, transparent outside the tile.

Regenerate desktop icons with:

```sh
npm run tauri icon -- assets/brand/notes-logo.png --output /tmp/notes-icons
# Copy the top-level PNG, ICO and ICNS files to src-tauri/icons;
# copy icon.png to public/logo.png. Mobile outputs are unused.
```
