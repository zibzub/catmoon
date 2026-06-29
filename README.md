# CatMoon

CatMoon is an interactive 3D MoonCat viewer. It places all **25,440 rescued MoonCats** onto a rotating geometric moon so you can explore the full collection, filter special groups, and look up the cats owned by a wallet.

## How to Use CatMoon

### Rotate, Zoom, and Explore

You can move around the CatMoon directly:

|Action|Desktop|Mobile|
|---|---|---|
|Rotate|Click and drag|Drag with one finger|
|Zoom|Mouse wheel / trackpad|Pinch|
|Roll / twist|Ctrl/Alt + drag|Two-finger twist|

CatMoon also rotates slowly on its own. Manual movement temporarily takes over so you can inspect a specific area.

## The Lock / Details Panel

The top-left control opens and closes the MoonCat details panel.

### Locked Mode

When the panel is locked/closed:

- Only the lock control is shown.
    
- CatMoon can still be rotated and explored.
    
- Clicking MoonCats will **not** open MoonCat links.
    
- This prevents accidental link clicks while you are just navigating the shape.
    

### Unlocked Mode

When the panel is unlocked/open:

- The details panel appears.
    
- Hovering or selecting a MoonCat can show its information.
    
- Clicking a MoonCat opens its page on MoonCatRescue.
    
- Filters, wallet lookup, and extra controls are available.
    

## Filters

The filter selector highlights specific groups of MoonCats.

When a filter is active:

- Matching MoonCats stay bright.
    
- Non-matching cats are dimmed.
    
- A label appears beside the lock control showing the active filter.
    
- The **Reset Filter** text clears the current filter and returns to all cats.
    

Selecting a filter may also rotate CatMoon toward a face containing matching cats.

## Wallet Cats

CatMoon can look up MoonCats owned by a wallet and highlight them on the moon.

### Looking Up a Wallet

Enter an Ethereum address or ENS name in the wallet field, then press **Lookup**.

Supported examples:

```text
0x1234567890abcdef1234567890abcdef12345678
vitalik.eth
vitalik
cats.vitalik
cats.vitalik.eth
```

If you enter an ENS name without `.eth`, CatMoon assumes `.eth`.

If an Ethereum address has a reverse ENS name, CatMoon may display the ENS name instead of the shortened address.

### Wallet Cat Display

When Wallet Cats are active:

- Cats owned by the wallet are highlighted.
    
- Wallet cats appear larger and lifted slightly above the surface.
    
- The active filter label shows the wallet or ENS name.
    
- You can switch to another filter and then return to the previous Wallet Cats entry from the filter selector.
    

### Wallet History

Recent wallet lookups are stored **locally in your browser**.

This means:

- History is saved only on your device/browser.
    
- It is not shared with the site owner.
    
- Clearing your browser storage may remove the history.
    
- Other browsers or devices will not automatically have the same history.
    

Selecting a previous wallet from the wallet field history can reload that wallet without pressing Lookup again.

### Bookmarking Wallet Cats

Wallet lookups can be bookmarked and shared.

After a successful lookup, the URL updates with a wallet parameter, such as:

```text
https://catmoon.zibzub.art/?wallet=vitalik.eth
```

or:

```text
https://catmoon.zibzub.art/?wallet=0x1234567890abcdef1234567890abcdef12345678
```

Opening a bookmarked wallet URL will automatically load that wallet’s MoonCats.

## MoonCat Links

When the details panel is unlocked, clicking a MoonCat opens its page on MoonCatRescue.

When the details panel is locked, MoonCat links are disabled so the shape can be explored without accidental navigation.

## The Geometry

CatMoon is based on a **rhombic triacontahedron**.

A rhombic triacontahedron is a 30-sided polyhedron made entirely of rhombus-shaped faces. It has:

- **30 rhombus faces**
    
- **60 edges**
    
- **32 vertices**
    

Each face of CatMoon contains **848 MoonCats**.

The full MoonCat rescue set contains:

```text
30 faces × 848 MoonCats per face = 25,440 MoonCats
```

So every rescued MoonCat has a place on the CatMoon.

### Why This Shape?

The rhombic triacontahedron is round enough to feel moon-like, but still has clear flat faces that work well for arranging pixel art. Each face acts like a small MoonCat panel, while the full shape forms a complete 3D collection view.

The rhombus faces are related to the golden ratio. Their angles are approximately:

```text
63.435° and 116.565°
```

This gives the shape its balanced, crystalline look.

## MoonCat Arrangement

MoonCats are placed by rescue-order ID.

Each face contains a consecutive group of 848 cats:

```text
Face 0: IDs 0–847
Face 1: IDs 848–1695
Face 2: IDs 1696–2543
...
Face 29: IDs 24592–25439
```

This makes CatMoon both a visual artwork and a spatial map of the MoonCat rescue order.

## Tips

- Unlock the panel before clicking MoonCats.
    
- Lock the panel again when you only want to rotate or zoom.
    
- Use filters to find important rescue groups quickly.
    
- Use wallet lookup to highlight owned cats.
    
- Bookmark a wallet URL to return directly to that wallet’s CatMoon view.
    
- On mobile, use pinch and two-finger twist gestures for easier navigation.
    

## Privacy Notes

Wallet lookups use public blockchain/MoonCat ownership data.

Wallet history is stored locally in your browser. CatMoon does not need an account, login, or wallet connection to show wallet cats.
