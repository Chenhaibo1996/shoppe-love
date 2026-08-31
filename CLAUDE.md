# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A 3D solar system interactive visualization built with **React 19**, **Three.js** (via `@react-three/fiber`), and **Vite 7**. Features a Sun, 6 orbiting planets with custom shaders for Earth, post-processing effects (Bloom + Vignette), a Milky Way galaxy background, and clickable planet info panels.

## Key Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Type check + production build
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
npm run deploy    # Build + deploy to GitHub Pages (gh-pages branch)
```

## Architecture

- **`src/App.tsx`** — The entire application lives in this single file (~380 lines). It exports a default `SolarSystem` component containing all scene logic.
- **`src/main.tsx`** — React entry point, mounts `<App />` into `#root`.
- **`public/`** — Static assets:
  - `textures/` — Planet surface maps, sun, earth day/night/cloud/normal maps, Milky Way starfield
  - `fonts/AlibabaPuHuiTi_Regular.json` — Font for Three.js text rendering

### Component Structure (all in `App.tsx`)

| Component | Purpose |
|-----------|---------|
| `Galaxy` | Skybox using `8k_stars_milky_way.jpg` on a back-faced sphere |
| `Sun` | Central sun sphere with `pointLight` and "I LOVE YOU" billboard text |
| `PlanetObject` | Individual planet with orbit, tilt, custom Earth shader, trails, hover labels |
| `OrbitingGroup` | Wraps planets in a rotating group for orbital motion |
| `CameraTracker` | Smoothly tracks and follows selected planet with `OrbitControls` |
| `HUD` | Right-side info panel showing selected planet name and description |
| `SolarSystem` (default) | Main scene orchestrator — Canvas, lighting, post-processing, layout |

### Earth Custom Shader

`EarthShaderMaterial` uses custom vertex + fragment shaders with 4 texture uniforms (day, night, cloud, normal maps). The fragment shader blends day/night based on sun direction, overlays cloud textures, and adds a Fresnel-based blue atmospheric glow at edges.

### Key Dependencies

- `@react-three/fiber` — React renderer for Three.js
- `@react-three/drei` — Helpers (OrbitControls, Stars, Trail, Text, Billboard, Html, Loader, useTexture)
- `@react-three/postprocessing` — Bloom + Vignette effects
- `babel-plugin-react-compiler` — Enabled in `vite.config.ts` for automatic memoization

### Post-Processing Known Issue

**Bloom + Vignette together cause black screen** when using default `EffectComposer` settings. Fix:
- Add `multisampling={0}` to `EffectComposer` (disables MSAA which conflicts with combined effects)
- Use `eskil={false}` on `Vignette` (standard mode, not Eskil variant)
- Avoid `mipmapBlur` prop on `Bloom` (can cause rendering issues on some GPUs)

### Deployment

Built with `gh-pages` for GitHub Pages deployment. The `vite.config.ts` sets `base: './'` so assets resolve via relative paths regardless of the deployment subpath.
