import { pad2 } from "./utils.js";

export const COLS = 160;
export const ROWS = 159;
export const TILE_W = 21;
export const TILE_H = 22;
export const ATLAS_W = COLS * TILE_W;
export const ATLAS_H = ROWS * TILE_H;
export const MAX_ID = COLS * ROWS - 1;
export const ALL_CATS_ATLAS_URL = "/img/allcats.png";
export const PREVIEW_SCALE = 4;
export const CLICK_MOVE_LIMIT = 6;
export const TOOLTIP_INACTIVITY_HIDE_MS = 3000;
export const PHI = (1 + Math.sqrt(5)) / 2;
export const TRI_FACE_COUNT = 30;
export const RHOMBUS_CAT_COUNT = 848;
export const TRI_MIN_DISTANCE = 0.55;
export const TRI_MAX_DISTANCE = 7;
export const TRI_FACE_BASE_SHORT_DIAG = 768;
export const TRI_FACE_TEXTURE_SCALE = 2;
// Future mobile optimization: lower scale, alternate img/tri-faces-mobile/, a face atlas, or compressed textures.
export const TRI_FACE_SHORT_DIAG = TRI_FACE_BASE_SHORT_DIAG * TRI_FACE_TEXTURE_SCALE;
export const TRI_FACE_LONG_DIAG = Math.round(TRI_FACE_SHORT_DIAG * PHI);
export const TRI_FACE_TEX_W = TRI_FACE_SHORT_DIAG;
export const TRI_FACE_TEX_H = TRI_FACE_LONG_DIAG;
export const TRI_FACE_CAT_PIXEL_SCALE = 2;
export const TRI_FACE_METADATA_URL = "/img/tri-faces/tri-face-slots.compact.json";
export const TRI_FACE_TEXTURE_DIR = "/img/tri-faces";
export const TRI_FACE_TEXTURE_PREFIX = "tri-face-";
export const FILTER_DATA_URL = "/data/mooncat-filters.json";
export const MOONCAT_NAMES_URL = "/data/mooncat-names.json";
export const FILTER_TEXTURE_DIR = "/img/filters";
export const FILTER_MANIFEST_URL = `${FILTER_TEXTURE_DIR}/filter-manifest.json`;
export const FILTER_BASE_OPACITY = 0.16;
export const WALLET_FILTER_KEY = "wallet";
export const WALLET_FILTER_LABEL = "Wallet Cats";
export const WALLET_LOOKUP_HISTORY_KEY = "catmoon.walletLookupHistory";
export const WALLET_LOOKUP_HISTORY_LIMIT = 8;
export const WALLET_CAT_SCALE = 1.5;
export const WALLET_OVERLAY_SURFACE_OFFSET = 0.02;
export const WALLET_HISTORY_AUTO_LOAD_DEBOUNCE_MS = 80;
export const CHARACTER_CATEGORY_KEYS = [
  "garfield",
  "cheshire",
  "pinkpanther",
  "alien",
  "zombie",
  "simba",
  "golden",
  "pikachu"
];
export const FILTER_DEFINITIONS = [
  { key: "named", names: true, setOnly: true },
  { key: "genesis", category: "genesis" },
  { key: "characters", categories: CHARACTER_CATEGORY_KEYS },
  { key: "day1", category: "day1" },
  { key: "week1", category: "week1" },
  { key: "2017", category: "2017" },
  { key: "2018", category: "2018" },
  { key: "2019", category: "2019" },
  { key: "2020", category: "2020" },
  { key: "earlyRescues", category: "earlyRescues" },
  { key: "2021", category: "2021" }
];
export const FILTER_KEYS = new Set(FILTER_DEFINITIONS.map((filter) => filter.key));
export const SET_ONLY_FILTER_KEYS = new Set(FILTER_DEFINITIONS.filter((filter) => filter.setOnly).map((filter) => filter.key));
export const PRELOAD_FILTER_KEYS = FILTER_DEFINITIONS.filter((filter) => !filter.setOnly).map((filter) => filter.key);
export const TOUCH_TWIST_ROLL_SPEED = 1.0;
export const DESKTOP_ROLL_DRAG_SPEED = 0.006;
export const DESKTOP_ROTATE_SPEED = 0.65;
export const TOUCH_ROTATE_SPEED = 0.38;
export const TOUCH_ZOOMED_ROTATE_SPEED = 0.24;
export const AUTO_ROTATE_ENABLED = true;
export const AUTO_ROTATE_SPEED_X = 0.035;
export const AUTO_ROTATE_SPEED_Y = 0.055;
export const AUTO_ROTATE_SPEED_Z = 0.01;
export const AUTO_ROTATE_RESUME_DELAY_MS = 5000;
export const AUTO_ROTATE_EASE_IN_MS = 1000;
export const FILTER_FOCUS_DURATION_MS = 1250;
export const STAR_PARALLAX_ENABLED = true;
export const STAR_PARALLAX_SMALL_STRENGTH = 36;
export const STAR_PARALLAX_LARGE_STRENGTH = 18;
export const STAR_PARALLAX_EASE = 0.06;
export const DRAG_RELEASE_MOMENTUM_MULTIPLIER = 2.1;

export function triFaceTextureUrl(faceIndex) {
  return `${TRI_FACE_TEXTURE_DIR}/${TRI_FACE_TEXTURE_PREFIX}${pad2(faceIndex)}.png`;
}

export function filterTextureUrl(filterKey, faceIndex) {
  return `${FILTER_TEXTURE_DIR}/${filterKey}/${TRI_FACE_TEXTURE_PREFIX}${pad2(faceIndex)}.png`;
}
