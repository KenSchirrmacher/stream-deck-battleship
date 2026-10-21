/**
 * Generates PNG icons for the Battleship plugin (plugin, category, and action icons).
 * Run: node scripts/generate-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "com.homedeck.battleship.sdPlugin", "imgs");

const GRID = 72;

function svgIcon(body, size) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}">
  <rect width="${GRID}" height="${GRID}" rx="${GRID * 0.18}" fill="#101014"/>
  ${body}
</svg>`);
}

async function writeIcon(dir, name, body, sizes = [72, 144]) {
  const folder = path.join(root, dir);
  fs.mkdirSync(folder, { recursive: true });
  for (const [index, size] of sizes.entries()) {
    const svg = svgIcon(body, size);
    const out = path.join(folder, `${name}${index === 1 ? "@2x" : ""}.png`);
    await sharp(svg).png().toFile(out);
  }
}

// Ocean grid with a ship silhouette and a hit marker, the classic Battleship shorthand.
const pluginBody = `
  <rect x="6" y="10" width="60" height="52" rx="6" fill="#14518C"/>
  <path d="M10 18 H62 M10 28 H62 M10 38 H62 M10 48 H62" stroke="#0D3B66" stroke-width="2"/>
  <path d="M18 14 V58 M30 14 V58 M42 14 V58 M54 14 V58" stroke="#0D3B66" stroke-width="2"/>
  <path d="M22 34 L30 34 L30 28 L42 28 L42 34 L50 34 L46 42 L26 42 Z" fill="#37474F"/>
  <circle cx="50" cy="20" r="6" fill="#B71C1C"/>
  <path d="M47 17 L53 23 M53 17 L47 23" stroke="#FFB300" stroke-width="2" stroke-linecap="round"/>`;

const categoryBody = `
  <path d="M22 44 L30 30 L42 30 L50 44 Z" fill="none" stroke="#FFFFFF" stroke-width="3"/>
  <circle cx="36" cy="22" r="5" fill="#FFFFFF"/>`;

const cellActionBody = `
  <rect x="12" y="12" width="48" height="48" rx="10" fill="#14518C" stroke="#0D3B66" stroke-width="2.5"/>
  <path d="M20 46 Q 28 42, 36 46 T 52 46" stroke="#1E6BB8" stroke-width="3" fill="none" stroke-linecap="round"/>`;

const turnIndicatorBody = `
  <rect x="12" y="12" width="48" height="48" rx="10" fill="#14518C" stroke="#0D3B66" stroke-width="2.5"/>
  <path d="M36 20 L40 30 L51 30 L42 37 L46 48 L36 41 L26 48 L30 37 L21 30 L32 30 Z" fill="#E3F2FD"/>`;

await writeIcon("plugin", "plugin-icon", pluginBody, [256, 512]);
await writeIcon("plugin", "category-icon", categoryBody, [28, 56]);
await writeIcon("actions/cell", "icon", cellActionBody);
await writeIcon("actions/turnindicator", "icon", turnIndicatorBody);

console.log("Icons generated in com.homedeck.battleship.sdPlugin/imgs/");
