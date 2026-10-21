import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const PHOTO = "C:/Users/kensc/Downloads/PXL_20261021_023721206.jpg";
const PLUGIN_ICON = "C:/users/kensc/OneDrive/Documents/GitHub/Stream Deck Battleship/com.homedeck.battleship.sdPlugin/imgs/plugin/plugin-icon@2x.png";
const OUT = "C:/Users/kensc/AppData/Local/Temp/claude/C--users-kensc-OneDrive-Documents-GitHub/c9391527-b74f-4f95-a256-95f796cb078e/scratchpad/marketplace-battleship";

fs.mkdirSync(OUT, { recursive: true });

// --- Icon: 288x288 from the existing plugin icon ---
await sharp(PLUGIN_ICON).resize(288, 288).png().toFile(path.join(OUT, "icon-288.png"));

// --- Thumbnail + gallery 0: real device photo ---
await sharp(PHOTO).resize(1920, 960, { fit: "cover", position: "attention" }).jpeg({ quality: 90 }).toFile(path.join(OUT, "thumbnail-1920x960.jpg"));
await sharp(PHOTO).resize(1920, 960, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toFile(path.join(OUT, "gallery-0-device-photo.jpg"));

// --- Reproduce the plugin's own key art (same code as src/game/render.ts) ---
const SIZE = 144;
const CELL_BORDER = "#0D3B66";
const WATER_BG = "#14518C";
const WATER_WAVE = "#1E6BB8";
const SHIP_BG = "#37474F";
const SHIP_HULL = "#607D8B";
const HIT_BG = "#B71C1C";
const HIT_FLAME = "#FFB300";
const SUNK_BG = "#263238";
const WIN_GLOW = "#43A047";
const LOSE_GLOW = "#FF6F00";
const RIPPLE = "#E3F2FD";

function cellWrap(bg, body, glow) {
  const ring = glow
    ? `<rect x="3" y="3" width="${SIZE - 6}" height="${SIZE - 6}" rx="20" fill="none" stroke="${glow}" stroke-width="6"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" rx="22" fill="${bg}" stroke="${CELL_BORDER}" stroke-width="3"/>
    ${body}
    ${ring}
  </svg>`;
}
function waterGlyph() {
  return `<path d="M20 56 Q 36 48, 52 56 T 84 56 T 116 56" stroke="${WATER_WAVE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M20 86 Q 36 78, 52 86 T 84 86 T 116 86" stroke="${WATER_WAVE}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}
function shipGlyph() {
  return `<path d="M30 76 L30 58 L46 50 L98 50 L114 58 L114 76 Z" fill="${SHIP_HULL}"/>
    <rect x="66" y="34" width="6" height="18" fill="${SHIP_HULL}"/>`;
}
function missGlyph() {
  return `<circle cx="72" cy="72" r="26" fill="none" stroke="${RIPPLE}" stroke-width="5"/>
    <circle cx="72" cy="72" r="12" fill="${RIPPLE}"/>`;
}
function hitGlyph() {
  return `<path d="M72 30 L82 58 L110 58 L86 76 L96 106 L72 88 L48 106 L58 76 L34 58 L62 58 Z" fill="${HIT_FLAME}"/>`;
}
function sunkGlyph() {
  return `<path d="M30 76 L30 58 L46 50 L98 50 L114 58 L114 76 Z" fill="#1C2327"/>
    <rect x="66" y="34" width="6" height="18" fill="#1C2327"/>
    <path d="M54 50 L63 76 M90 50 L81 76" stroke="${HIT_FLAME}" stroke-width="4" stroke-linecap="round"/>
    <path d="M64 40 Q 68 28, 74 34 Q 78 24, 84 30" stroke="#78909C" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.7"/>`;
}
function waterFrame() { return cellWrap(WATER_BG, waterGlyph()); }
function shipFrame() { return cellWrap(SHIP_BG, shipGlyph()); }
function missFrame() { return cellWrap(WATER_BG, missGlyph()); }
function hitFrame() { return cellWrap(HIT_BG, hitGlyph()); }
function sunkFrameGood() { return cellWrap(SUNK_BG, sunkGlyph(), WIN_GLOW); }
function sunkFrameBad() { return cellWrap(SUNK_BG, sunkGlyph(), LOSE_GLOW); }

async function renderBoard(outFile, width, height, board) {
  const W = 1920, H = 960;
  const gap = 16, outerMargin = 60;
  const cellFromHeight = Math.floor((H - outerMargin * 2 - gap * (height - 1)) / height);
  const cellFromWidth = Math.floor((W - outerMargin * 2 - gap * (width - 1)) / width);
  const cell = Math.min(cellFromHeight, cellFromWidth);
  const contentW = width * cell + (width - 1) * gap;
  const contentH = height * cell + (height - 1) * gap;
  const padX = Math.round((W - contentW) / 2);
  const padY = Math.round((H - contentH) / 2);

  const composites = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const svg = board[r][c];
      composites.push({
        input: await sharp(Buffer.from(svg)).resize(cell, cell).png().toBuffer(),
        left: padX + c * (cell + gap),
        top: padY + r * (cell + gap),
      });
    }
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: "#0b1726" } })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(path.join(OUT, outFile));
}

// --- Gallery 1: My Fleet mid-battle, 7 wide x 4 tall -- ships placed, enemy has landed some hits ---
{
  const width = 7, height = 4;
  // . = water, s = ship, h = hit, m = miss, g = sunk (bad, enemy sank it)
  const layout = [
    ".ssss..",
    "..m....",
    ".ss.h..",
    "...h.ss",
  ];
  const board = layout.map((row) =>
    row.split("").map((ch) => {
      if (ch === ".") return waterFrame();
      if (ch === "s") return shipFrame();
      if (ch === "m") return missFrame();
      if (ch === "h") return hitFrame();
      return waterFrame();
    })
  );
  await renderBoard("gallery-1-my-fleet.jpg", width, height, board);
}

// --- Gallery 2: Enemy Waters, a ship just sunk (green glow) ---
{
  const width = 7, height = 4;
  const w = waterFrame, m = missFrame, h = hitFrame, g = sunkFrameGood;
  const board = [
    [w(), m(), w(), w(), g(), g(), w()],
    [w(), w(), h(), w(), w(), w(), m()],
    [m(), w(), w(), w(), h(), w(), w()],
    [w(), w(), m(), w(), w(), w(), w()],
  ];
  await renderBoard("gallery-2-enemy-waters.jpg", width, height, board);
}

console.log("Done:", fs.readdirSync(OUT));
