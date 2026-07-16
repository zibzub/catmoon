# CatMoon

![CatMoon screenshot](screenshot.png)

CatMoon is an interactive 3D MoonCat viewer. It places all **25,440 rescued MoonCats** onto a rotating geometric moon so you can explore the collection, pin cat details, filter special rescue groups, and look up MoonCats owned by a wallet.

---

# User Guide

## Explore the CatMoon

| Action | Desktop | Mobile |
| --- | --- | --- |
| Rotate / tumble | Click and drag | Drag with one finger |
| Zoom | Mouse wheel / trackpad | Pinch |
| Roll / twist | Ctrl/Alt-drag or right-click-drag | Two-finger twist |
| Pin cat details | Click a cat | Press a cat |

CatMoon can slowly auto-tumble on its own. Manual movement pauses the motion briefly so you can inspect the moon.

## Details Panel, Toggles, and Help

The lock button expands or collapses the settings panel.

**Locked**

- The settings controls are hidden.
- The lock button remains available.
- When a filter is active, a compact active-filter badge remains available so you can reset the filter.
- You can still rotate, zoom, filter by URL, and pin cat details.

**Unlocked**

- Filters, wallet lookup, and help are available.
- Toggle controls appear as compact button-style controls in a 2x2 grid for easier touch use. Each button clearly shows whether it is On or Off.
- The `?` button in the top-right opens a compact help panel with controls and project links.
- Available toggles:
  - **Auto tumble**: turn automatic rotation on or off.
  - **Early rescue zone**: show or hide a rough face-level guide for the earliest rescue-order area.

Toggle preferences are stored locally in your browser. The help panel open/closed state is temporary for the current page session.

## Hover and Pinned Cat Cards

On desktop, hovering a MoonCat shows a small card near the cursor after a short intent delay. The card shows the rescue-order number, a preview image when enabled, and the cat name if the cat has been named.

On touch screens, transient hover cards are suppressed during gestures so they do not interfere with tumbling. Tap or press a cat to pin its detail card instead.

Clicking or pressing a cat pins its detail card on screen:

- Click or press the same cat again to hide the pinned card.
- Click or press a different cat to replace the pinned card.
- While a card is pinned, hover cards for other cats are hidden to avoid overlap.
- While a card is pinned, auto-tumble pauses.
- If you tumble far enough away from the pinned cat, the pinned card clears automatically.

Clicking the image in a pinned card opens an expanded, theme-ready collectible card. Its footer includes a Theme selector: **Modern** uses the `rare-card` black portrait shell with coat-hue framing, while **Classic Pepe** uses a narrower retro collectible-card treatment. **Template Frame** uses the local transparent card frame with the MoonCat image and detail regions mapped into its windows. The selected theme is stored locally in the browser and defaults safely to Modern. All themes include the larger atlas preview, a compact rescue/year-hue-pattern strip, remaining rescue traits, and explicit links to [ChainStation](https://mooncatrescue.com) and OpenSea. OpenSea links use the Acclimated MoonCats contract, so they may not resolve every cat.

## Filters

Use the filter dropdown to highlight groups of MoonCats.

Available filters include:

- Named Cats
- Genesis Cats
- Character Cats
- Day 1 Rescues
- Week 1 Rescues
- 2017–2021 rescue-year groups
- All Early Rescues
- Wallet Cats, after a wallet lookup

When a filter is active, matching cats stay bright and the rest of the CatMoon is dimmed. Use the active filter badge near the lock button to reset back to all cats. On narrow screens, long wallet labels are kept on one line and ellipsized instead of wrapping.

Wallet Cats, Named Cats, and Character Cats can use runtime overlay highlights generated in the browser from the MoonCat atlas and the active ID set.

The optional **Early rescue zone** toggle marks the first 7 rhombic faces, which roughly cover rescue-order IDs 0–5935. It is a broad face-level guide, not an exact early-rescue cat selector. It currently appears only in broad filtered modes where it adds context without crowding more specific rescue filters: Named Cats, Character Cats, and Wallet Cats.

## Wallet Cats

CatMoon can highlight MoonCats owned by an Ethereum wallet.
This includes cats that are original, Acclimated or in the JumpPort.

Enter an address or ENS name, then press **Lookup**.

Examples:

```text
0x1234567890abcdef1234567890abcdef12345678
vitalik.eth
vitalik
cats.vitalik
cats.vitalik.eth
```

ENS shortcuts are normalized:

```text
vitalik -> vitalik.eth
cats.vitalik -> cats.vitalik.eth
cats.vitalik.eth -> cats.vitalik.eth
```

When Wallet Cats are active:

- owned cats are highlighted on the moon
- wallet cats appear slightly larger and lifted from the surface
- the active filter label shows the wallet or ENS name
- the wallet view can be bookmarked or shared

Example wallet URL:

```text
https://catmoon.zibzub.art/?wallet=vitalik.eth
```

## Wallet History and Privacy

Recent wallet lookups are stored locally in your browser.

CatMoon does not require:

- wallet connection
- account login
- signature approval

Wallet history and UI toggle settings are not synced between browsers or devices. Clearing browser storage may remove them.

---

# Technical Details

## Project Structure

CatMoon is a Vite application deployed to Cloudflare Pages with a small Cloudflare Pages Function for wallet lookup.

```text
index.html
src/
  main.js
  styles.css
  js/
    config.js
    dom.js
    utils.js
    wallet.js
    filters.js
    preview.js
    cat-details.js
    catmoon-geometry.js
    controls.js
public/
  _headers
  favicon.ico
  favicon-16x16.png
  favicon-32x32.png
  apple-touch-icon.png
  android-chrome-192x192.png
  data/
    mooncat-filters.json
    mooncat-names.json
    mooncat-details/
  img/
    allcats.png
    tri-faces/
    filters/

functions/
  api/
    wallet-cats.js

test/
  config.test.js
  utils.test.js
  wallet.test.js

tools/
  extract-mooncat-names.js
  extract-mooncat-details.js
```

Vite bundles `src/main.js` and copies the static contents of `public/` unchanged into `dist/`. Three.js is installed as an npm dependency; the app uses normal `three` and `three/addons/...` imports.

## Local Development

Install dependencies:

```bash
npm ci
```

Start the Vite development server:

```bash
npm run dev
```

For testing the production build with the Pages Function:

```bash
npm run dev
npx wrangler pages dev dist
```

Create a production build:

```bash
npm run build
```

Optionally serve the production build locally:

```bash
npm run preview
```

Run syntax checks:

```bash
npm run check
```

Run unit tests:

```bash
npm test
```

Generate the names-only MoonCat data file from a local `mooncat_traits.json` source file:

```bash
npm run build:names
```

Generate compact, face-based detail shards from the same local source:

```bash
npm run build:details
```

## Cloudflare Pages

Recommended Cloudflare Pages settings:

```text
Build command: npm run build
Output directory: dist
```

The wallet lookup function is deployed from `functions/api/wallet-cats.js` and requires an Ethereum RPC endpoint:

```text
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

## Wallet Lookup API

The frontend calls:

```text
/api/wallet-cats?address=...
```

It supports Ethereum addresses and ENS names. It uses `viem` for Ethereum and ENS resolution. Wallet ownership data comes from the MoonCatRescue API.

Successful wallet lookup responses are cached at the Cloudflare edge for 5 minutes. Invalid inputs return `400` with `cache-control: no-store`.

Input protection rejects missing, too-long, or unsafe lookup inputs before ENS/RPC/API work is attempted.

## Geometry

CatMoon is a **rhombic triacontahedron**:

```text
30 rhombus faces
848 MoonCats per face
25,440 total MoonCats
```

MoonCats are arranged by rescue-order ID:

```text
globalId = faceIndex * 848 + slot.id
```

Example ranges:

```text
Face 0:  IDs 0–847
Face 1:  IDs 848–1695
Face 2:  IDs 1696–2543
...
Face 29: IDs 24592–25439
```

This makes CatMoon both a visual artwork and a spatial map of the full MoonCat rescue set.

## Image Assets

Base face textures:

```text
public/img/tri-faces/tri-face-00.png
...
public/img/tri-faces/tri-face-29.png
```

Triangular face textures are generated with deterministic jittering, so the same inputs produce stable, repeatable face images.

Slot metadata:

```text
public/img/tri-faces/tri-face-slots.compact.json
```

Full MoonCat atlas:

```text
public/img/allcats.png
```

The full atlas is lazy-loaded only when needed for hover/pinned previews, named-cat overlays, or wallet overlays.

Filter overlays:

```text
public/img/filters/<filterKey>/tri-face-XX.png
public/img/filters/filter-manifest.json
```

Most built-in filters use static overlay textures. Runtime-only filters, such as Named Cats and Wallet Cats, generate overlay textures in the browser from `allcats.png` and the relevant ID set.

The optional early rescue zone uses a lightweight Three.js mesh layer over faces 0–6. It does not use generated PNG assets.

Transient hover cards use a short intent delay and touch cooldown so preview cards do not fight with manual tumble gestures.

## Filters and Names Data

Static filter categories are defined in:

```text
public/data/mooncat-filters.json
```

Named cats are defined in a generated names-only file:

```text
public/data/mooncat-names.json
```

The source traits file is expected at the repo root when regenerating names:

```text
mooncat_traits.json
```

Run this to extract only non-empty names keyed by rescue-order ID:

```bash
npm run build:names
```

The generated names file is used for:

- displaying cat names in hover and pinned cards
- the Named Cats filter ID set
- runtime Named Cats overlay generation

The full traits file is not required by the browser app.

## Detail Data

Expanded MoonCat details load only one generated 848-cat face shard at a time from `public/data/mooncat-details/face-XX.json`. The browser caches completed face requests and retries failed requests on the next open or through the dialog retry button. The ignored root `mooncat_traits.json` is only used by the generator and is not served to browsers.

Regenerate the committed shards after updating the local traits source:

```bash
npm run build:details
```

## UI State

The app stores lightweight preferences in browser `localStorage`, including:

```text
catmoon.walletLookupHistory
catmoon.autoTumble
catmoon.earlyRescueZone
```

These settings are local to the browser and are safe to clear. The help panel state is intentionally not persisted.

## Tests

The test suite uses Node’s built-in test runner.

Current coverage focuses on:

- config constants and URL helpers
- utility helpers
- wallet normalization and history helpers

Run:

```bash
npm test
```

## Acknowledgements

CatMoon uses MoonCat artwork/background PNG assets sourced from MoonCatRescue.com, and wallet ownership lookup data from the MoonCatRescue API. These external artwork assets are included for MoonCat visualization purposes and are not relicensed by CatMoon’s GPL-3.0-or-later license.

CatMoon was inspired by the Allcats site created by cmfb.

## License

CatMoon is licensed under **GPL-3.0-or-later**. See [LICENSE](LICENSE) for details.
