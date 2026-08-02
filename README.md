# CatMoon

![CatMoon screenshot](screenshot.png)

CatMoon is an interactive 3D viewer for all **25,440 rescued MoonCats**. It arranges the collection on a rotating rhombic triacontahedron, with rescue-order lookup, collection filters, wallet ownership overlays, expanded cat cards, and several rendering styles.

## User Guide

### Explore the CatMoon

| Action | Desktop | Mobile |
| --- | --- | --- |
| Rotate / tumble | Click and drag | Drag with one finger |
| Zoom | Mouse wheel or trackpad | Pinch |
| Roll / twist | Ctrl/Alt-drag or right-click-drag | Two-finger twist |
| Pin a cat | Click a cat | Tap a cat |

Manual movement pauses automatic tumbling briefly so the moon can be inspected. The lock button expands or collapses the HUD; its active-filter badge remains available to reset a filter when the HUD is locked. The `?` button opens a compact help panel.

### HUD toggles

The unlocked HUD has four touch-friendly toggles:

| Toggle | What it does |
| --- | --- |
| **Auto tumble** | Starts or stops the moon's automatic rotation. |
| **Early rescue zone** | Shows a rough face-level guide for the early rescue area when a contextual filter is active. |
| **3D starfield** | Shows or hides the layered starfield background. |
| **Performance** | Shows or hides the diagnostics monitor. |

The Performance monitor reports current and smoothed FPS, frame and rolling-average time, current camera distance, and a rolling frame-time graph. It is intended for tuning and diagnostics, not for normal navigation.

### Render modes

Choose a render mode from the HUD. The small icon beside the label reflects the selected mode, and the choice is saved locally in the browser.

| Mode | Description |
| --- | --- |
| **Pixel Moon** | Crisp nearest-neighbour MoonCat textures. |
| **Smooth Moon** | Smoothed, mipmapped MoonCat textures. |
| **Tracer Moon** | A persistent afterimage treatment that leaves motion trails. Trails remain visible even when the moon body is hidden in Wallet Cats mode. |
| **Bokeh Moon** | Depth-of-field rendering. Entering this mode uses its closer Bokeh view; afterwards, normal zoom remains under your control. |
| **Shadow Moon** | A lit rendering treatment with the MoonCat material and lighting enabled. |

When **Bokeh Moon** is active, the HUD also exposes:

- **Focus**
- **Aperture**
- **Blur**
- **Reset DOF**, which restores the Bokeh defaults

Depth-of-field values are saved locally. They do not affect the other render modes.

### Find Rescue

Enter a whole rescue-order ID from `0` through `25439`, then select **Find**. CatMoon rotates and zooms to place that MoonCat in view, then pins its preview at the centre of the screen. Auto tumble remains paused while that lookup-created preview is pinned; closing it resumes tumble only when Auto tumble is enabled.

Rescue selections can also be shared or bookmarked with URL parameters:

```text
https://catmoon.zibzub.art/?rescue=1234
https://catmoon.zibzub.art/?rescue=1234&view=details
```

The first form focuses and pins Rescue `1234`; the `view=details` form also opens its existing detail card after the focus animation. `view=pin` and unknown view values use the pinned-preview form. Pinning, opening details, closing details, and clearing a selection update these parameters without adding a browser history entry, while preserving wallet parameters, other query parameters, and the URL hash.

### Hover, pinned previews, and detail cards

On desktop, a short hover-intent delay reveals a compact MoonCat preview. On touch devices, transient hover previews are suppressed during gestures to keep tumbling clear.

Selecting a cat pins its preview. While it is pinned:

- Select the same cat again, or select the pinned preview, to open the expanded detail card.
- Select another cat to replace the pin.
- Select empty space or use the preview's close button to clear the pin.
- Moving the moon far enough that the pin leaves its screen area also clears it.

The expanded card has its own top-right close control and also supports Escape and backdrop close. Its image opens card actions for:

- **ChainStation**
- **OpenSea** — this uses the Acclimated MoonCats contract, so a link may not resolve for every cat
- **Save Card** — exports a 600 × 840 PNG card

The bottom of the template card shows a centered classification label when applicable. Early rescue labels are `day 1` or `day 2`; later canonical Week 1 members show `week 1`. Genesis cats append `genesis` after rescue timing, so the visible order is `DAY 1 • GENESIS`, and Genesis suppresses any character subtype. Non-Genesis character members show their exact subtype such as `character: zombie`.

Black Genesis cards use a white classification label for contrast; white Genesis and ordinary cards retain the dark label color.

### Filters

Use **Filter cats** to highlight a group while dimming the rest of the moon. Available filters are:

- All Cats
- Wallet Cats, after a successful wallet lookup
- Named Cats
- Genesis Cats
- Character Cats
- Day 1 Rescues
- Week 1 Rescues
- All Early Rescues
- 2021 Rescues

The active-filter badge resets back to All Cats. Named Cats, Character Cats, and Wallet Cats use browser-generated overlays from the MoonCat atlas; most other built-in filters use prepared overlay textures.

**Early rescue zone** marks faces 0–6, roughly rescue orders 0–5935. It is a broad visual guide, not an exact early-rescue selector. It appears only with Named Cats, Character Cats, and Wallet Cats, where it is useful context.

### Wallet Cats

Look up an Ethereum address or ENS name to highlight cats associated with that wallet. The lookup covers MoonCat Rescue ownership data, including original, Acclimated, and JumpPort cats returned by the API.

Examples:

```text
0x1234567890abcdef1234567890abcdef12345678
vitalik.eth
vitalik
cats.vitalik
cats.vitalik.eth
```

ENS shortcuts are normalized, so `vitalik` becomes `vitalik.eth` and `cats.vitalik` becomes `cats.vitalik.eth`.

In Wallet Cats mode, owned-cat overlays are enlarged slightly and lifted above the moon surface. The wallet label appears in the active-filter badge. Wallet views can be shared or bookmarked with a URL such as:

```text
https://catmoon.zibzub.art/?wallet=vitalik.eth
```

The wallet-only **Hide Moon** / **Show Moon** control tests the owned-cat overlays in isolation:

- It appears only while Wallet Cats is active.
- **Hide Moon** hides the base faces, backing, edges, and early-rescue-zone geometry.
- Wallet-owned overlays remain visible and keep their existing surface offset.
- **Show Moon** restores the normal wallet view without another lookup.
- This state is session-only and resets when Wallet Cats is exited.

### Wallet history and privacy

Recent wallet lookups are stored locally for quick reuse. CatMoon does not require a wallet connection, login, or signature approval. Local history and preferences are not synchronized between devices, and clearing browser storage removes them.

## Technical Details

### Project structure

CatMoon is a Vite application deployed to Cloudflare Pages. A Pages Function handles wallet lookup.

```text
index.html
src/
  main.js                       App state, HUD wiring, scene coordination
  styles.css
  js/
    backgrounds.js              Layered 3D starfield
    rendering.js                Render modes, Tracer, Bokeh, lighting
    performance-monitor.js      Optional diagnostics monitor
    controls.js                 Pointer, touch, tumble, roll, and zoom input
    catmoon-geometry.js         Rhombic triacontahedron and rescue mapping
    rescue-url.js               Shareable rescue-selection URL helpers
    filters.js                  Filter data and overlay loading
    preview.js                  Atlas preview management
    wallet.js                   Wallet URL and local-history helpers
    cat-details.js              Detail loading and external links
    cat-details-export.js       PNG card export
    cat-details-text-fit.js     Compact card-text fitting
    cat-details-theme.js        Stored card-theme normalization
    config.js
    dom.js
    utils.js
functions/
  api/
    wallet-cats.js              Cloudflare Pages wallet endpoint
public/
  data/                         Filters, names, and detail shards
  img/                          Atlas, face textures, filters, card frame
  _headers
test/                           Node test files by module/feature
tools/
  sync-mooncat-names.js       Canonical mooncat-name-index mirror updater
  extract-mooncat-names.js    Legacy local-traits name extractor
  extract-mooncat-details.js
```

Vite bundles `src/main.js` and copies `public/` into `dist/`. The application imports `three` and `three/addons/...` directly.

### Local development

Install dependencies:

```bash
npm ci
```

For frontend-only Vite work:

```bash
npm run dev
```

For LAN or mobile testing with Vite, expose the server on all interfaces:

```bash
npm run dev -- --host 0.0.0.0
```

To test a production build together with the Cloudflare Pages Function, build first, then serve `dist/` with Wrangler:

```bash
npm run build
npx wrangler pages dev dist
```

For LAN or mobile access to the Wrangler server:

```bash
npx wrangler pages dev dist --ip 0.0.0.0
```

`npm run preview` serves the Vite production build but does not run the Pages Function.

Other useful commands:

```bash
npm run check
npm test
npm run sync:names
npm run build:names
npm run build:names:legacy-traits
npm run build:details
```

`npm run sync:names` is the canonical command for updating `public/data/mooncat-names.json`. It mirrors `data/names-simple.json` from `mooncatdao/mooncat-name-index` and validates rescue-order keys and string values before atomically installing the deterministic output. Set `MOONCAT_NAMES_SOURCE_URL` to use a maintained fork or an offline test fixture.

`npm run build:names` remains a compatibility alias for the canonical sync. The explicitly named `npm run build:names:legacy-traits` command uses the local root-level `mooncat_traits.json` extractor and is not the current-name source. That source is not required by the browser app.

The `Sync MoonCat names` GitHub Actions workflow runs the canonical sync every six hours and can also be started manually from the repository's **Actions** tab with **Run workflow**. After running the repository tests and checks, it commits and pushes only `public/data/mooncat-names.json` when the mirrored data changed.

### Cloudflare Pages and wallet API

Recommended Pages settings:

```text
Build command: npm run build
Output directory: dist
```

The frontend calls:

```text
/api/wallet-cats?address=...
```

`functions/api/wallet-cats.js` validates address/ENS-like input, resolves ENS through Ethereum mainnet when needed, queries MoonCat Rescue ownership data, and returns normalized rescue-order IDs. Configure an RPC endpoint for ENS support:

```text
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

Successful responses are cached at the Cloudflare edge for five minutes. Invalid or failed requests use `no-store` responses.

### Geometry, images, and generated data

CatMoon is a rhombic triacontahedron with 30 rhombus faces and 848 cats per face:

```text
30 × 848 = 25,440 MoonCats
global rescue order = faceIndex × 848 + slotId
```

Face ranges therefore run from face 0 (`0–847`) through face 29 (`24592–25439`). This makes rescue order both an identifier and a position on the moon.

Key assets and generated data:

| Resource | Purpose |
| --- | --- |
| `public/img/tri-faces/tri-face-XX.png` | Base face textures. |
| `public/img/tri-faces/tri-face-slots.compact.json` | Slot metadata for each face. |
| `public/img/allcats.png` | Full atlas, lazy-loaded for previews and runtime overlays. |
| `public/img/filters/` | Built-in filter overlays and manifest. |
| `public/data/mooncat-filters.json` | Static filter categories. |
| `public/data/mooncat-names.json` | Deterministic mirror of `mooncat-name-index/data/names-simple.json`. |
| `public/data/mooncat-details/face-XX.json` | Generated 848-cat detail shards. |

The early-rescue guide is a lightweight Three.js mesh layer over faces 0–6; it does not use a generated PNG. Expanded details fetch only the needed face shard, cache successful requests, and can retry a failed fetch. Update names with `npm run sync:names` and details with `npm run build:details`.

### UI state and persistence

The following browser-local values persist across visits when storage is available:

| State | Storage key |
| --- | --- |
| Auto tumble | `catmoon.autoTumble` |
| Early rescue zone | `catmoon.earlyRescueZone` |
| 3D starfield | `catmoon.hybridStarfieldEnabled.v1` |
| Performance monitor | `catmoon.performanceMonitorEnabled.v1` |
| Render mode | `catmoon.renderMode` |
| Bokeh settings | `catmoon.depthOfFieldSettings.v2` |
| Wallet lookup history | `catmoon.walletLookupHistory` |
| Detail-card theme | `catmoon.detailsTheme.v1` |

The active wallet can also be represented in the `?wallet=` URL parameter. The HUD/help state, current filter, pinned preview, open detail card, focus animation, and Hide Moon/Show Moon state are session-only. Clearing browser storage is safe, but removes the persistent preferences and saved wallet history.

### Tests

The project uses Node's built-in test runner:

```bash
npm test
```

Current tests cover:

- hybrid starfield generation and lifecycle (`backgrounds.test.js`)
- detail data, themes, text fitting, and card export (`cat-details*.test.js`)
- rhombic geometry and rescue lookup mapping (`catmoon-geometry.test.js`, `rescue-lookup.test.js`)
- configuration and utility helpers (`config.test.js`, `utils.test.js`)
- rendering modes, Tracer/Bokeh behavior, and DOF persistence (`rendering.test.js`)
- performance-monitor calculations and display state (`performance-monitor.test.js`)
- wallet normalization, URLs, and lookup history (`wallet.test.js`)

Run `npm run check` for JavaScript syntax checks and `npm run build` for a production bundle.

## Acknowledgements

CatMoon uses MoonCat artwork and background PNG assets sourced from MoonCatRescue.com, plus wallet ownership data from the MoonCat Rescue API. These external artwork assets are included for MoonCat visualization purposes and are not relicensed by CatMoon's GPL-3.0-or-later license.

CatMoon was inspired by the Allcats site created by cmfb.

## License

CatMoon is licensed under **GPL-3.0-or-later**. See [LICENSE](LICENSE) for details.
