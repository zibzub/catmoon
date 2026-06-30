# CatMoon

![CatMoon screenshot](screenshot.png)

CatMoon is an interactive 3D MoonCat viewer. It places all **25,440 rescued MoonCats** onto a rotating geometric moon so you can explore the collection, highlight special rescue groups, and look up MoonCats owned by a wallet.

---

# User Manual

## Explore the CatMoon

| Action       | Desktop                           | Mobile               |
| ------------ | --------------------------------- | -------------------- |
| Rotate       | Click and drag                    | Drag with one finger |
| Zoom         | Mouse wheel / trackpad            | Pinch                |
| Roll / twist | Ctrl/Alt-drag or right-click-drag | Two-finger twist     |

CatMoon rotates slowly on its own. Manual movement pauses auto-rotation briefly so you can inspect the shape.

## Lock and Details Panel

The lock button in the top-left controls whether MoonCat details and links are active.

**Locked**

* Only the lock button is shown.
* You can rotate, zoom, and explore.
* MoonCat links are disabled to prevent accidental clicks.

**Unlocked**

* The details panel appears.
* Hovering a MoonCat shows its ID and preview.
* Clicking a MoonCat opens its MoonCatRescue page.
* Filters and wallet lookup are available.

## Filters

Use the filter dropdown to highlight groups of MoonCats.

Available filters include:

* Genesis Cats
* Character Cats
* Day 1 Rescues
* Week 1 Rescues
* 2017–2021 rescue-year groups
* All Early Rescues
* Wallet Cats, after a wallet lookup

When a filter is active, matching cats stay bright and the rest of the CatMoon is dimmed. Use the active filter badge to reset back to all cats.

## Wallet Cats

CatMoon can highlight MoonCats owned by an Ethereum wallet.

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

* owned cats are highlighted on the moon
* wallet cats appear slightly larger and lifted from the surface
* the active filter label shows the wallet or ENS name
* the wallet view can be bookmarked or shared

Example wallet URL:

```text
https://catmoon.zibzub.art/?wallet=vitalik.eth
```

## Wallet History and Privacy

Recent wallet lookups are stored locally in your browser.

CatMoon does not require:

* wallet connection
* account login
* signature approval

Wallet history is not synced between browsers or devices. Clearing browser storage may remove it.

---

# Technical Details

## Project Structure

CatMoon is a static Cloudflare Pages site.

```text
public/
  index.html
  main.js
  styles.css
  js/
    config.js
    dom.js
    utils.js
    wallet.js
    filters.js
    preview.js
    catmoon-geometry.js
    controls.js
  data/
    mooncat-filters.json
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
```

The frontend uses browser-native ES modules. There is no frontend build step.

Three.js is loaded from jsDelivr through the import map in `public/index.html`.

## Local Development

Install dependencies:

```bash
npm ci
```

Run syntax checks:

```bash
npm run check
```

Run unit tests:

```bash
npm test
```

Preview locally with Cloudflare Pages:

```bash
npx wrangler pages dev public
```

## Cloudflare Pages

Recommended Cloudflare Pages settings:

```text
Build command: npm ci
Output directory: public
```

The wallet lookup function requires an Ethereum RPC endpoint:

```text
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

## Wallet Lookup API

The frontend calls:

```text
/api/wallet-cats?address=...
```

The Cloudflare Pages Function:

```text
functions/api/wallet-cats.js
```

supports Ethereum addresses and ENS names. It uses `viem` for Ethereum and ENS resolution.
Wallet ownership data comes from the MoonCatRescue API.

Successful wallet lookup responses are cached at the Cloudflare edge for 5 minutes. Invalid inputs return `400` with `cache-control: no-store`.

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

This makes the CatMoon both a visual artwork and a spatial map of the full MoonCat rescue set.

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

The full atlas is lazy-loaded only when needed for previews or wallet overlays.

Filter overlays:

```text
public/img/filters/<filterKey>/tri-face-XX.png
public/img/filters/filter-manifest.json
```

## Tests

The test suite uses Node’s built-in test runner.

Current coverage focuses on:

* config constants and URL helpers
* utility helpers
* wallet normalization and history helpers

Run:

```bash
npm test
```

## Acknowledgements

CatMoon uses MoonCat artwork/background PNG assets sourced from MoonCatRescue.com, and wallet ownership lookup data from the MoonCatRescue API. These external artwork assets are included for MoonCat visualization purposes and are not relicensed by CatMoon’s GPL-3.0-or-later license.

CatMoon was inspired by the Allcats site created by cmfb.

## License

CatMoon is licensed under **GPL-3.0-or-later**. See [LICENSE](LICENSE) for details.
