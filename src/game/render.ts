const SIZE = 144;
const CELL_BORDER = "#0D3B66";
const WATER_BG = "#14518C";
const WATER_WAVE = "#1E6BB8";
const HIT_BG = "#B71C1C";
const HIT_FLAME = "#FFB300";
const SUNK_BG = "#263238";
const WIN_GLOW = "#43A047";
const RIPPLE = "#E3F2FD";

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function cellWrap(bg: string, body: string, glow?: string): string {
  const ring = glow
    ? `<rect x="3" y="3" width="${SIZE - 6}" height="${SIZE - 6}" rx="20" fill="none" stroke="${glow}" stroke-width="6"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" rx="22" fill="${bg}" stroke="${CELL_BORDER}" stroke-width="3"/>
    ${body}
    ${ring}
  </svg>`;
}

function waterGlyph(): string {
  return `<path d="M20 56 Q 36 48, 52 56 T 84 56 T 116 56" stroke="${WATER_WAVE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M20 86 Q 36 78, 52 86 T 84 86 T 116 86" stroke="${WATER_WAVE}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}

function missGlyph(): string {
  return `<circle cx="72" cy="72" r="26" fill="none" stroke="${RIPPLE}" stroke-width="5"/>
    <circle cx="72" cy="72" r="12" fill="${RIPPLE}"/>`;
}

function hitGlyph(): string {
  return `<path d="M72 30 L82 58 L110 58 L86 76 L96 106 L72 88 L48 106 L58 76 L34 58 L62 58 Z" fill="${HIT_FLAME}"/>`;
}

function sunkGlyph(): string {
  return `<circle cx="72" cy="72" r="34" fill="#101014"/>
    <path d="M58 58 L86 86 M86 58 L58 86" stroke="${HIT_FLAME}" stroke-width="7" stroke-linecap="round"/>`;
}

export function waterFrame(): string {
  return toDataUri(cellWrap(WATER_BG, waterGlyph()));
}

export function missFrame(): string {
  return toDataUri(cellWrap(WATER_BG, missGlyph()));
}

export function hitFrame(): string {
  return toDataUri(cellWrap(HIT_BG, hitGlyph()));
}

export function sunkFrame(): string {
  return toDataUri(cellWrap(SUNK_BG, sunkGlyph(), WIN_GLOW));
}

export type Turn = "player" | "enemy" | "win";

const INDICATOR_BG: Record<Turn, string> = {
  player: "#14518C",
  enemy: "#B71C1C",
  win: "#2E7D32",
};

function indicatorGlyph(turn: Turn): string {
  if (turn === "player") {
    return `<path d="M72 28 L80 48 L102 48 L84 62 L92 86 L72 72 L52 86 L60 62 L42 48 L64 48 Z" fill="#E3F2FD"/>`;
  }
  if (turn === "enemy") {
    return `<circle cx="72" cy="72" r="26" fill="none" stroke="#FFCDD2" stroke-width="5"/>
      <circle cx="72" cy="72" r="6" fill="#FFCDD2"/>
      <path d="M72 38 L72 48 M72 96 L72 106 M38 72 L48 72 M96 72 L106 72" stroke="#FFCDD2" stroke-width="5" stroke-linecap="round"/>`;
  }
  return `<path d="M72 30 L82 58 L110 58 L86 76 L96 106 L72 88 L48 106 L58 76 L34 58 L62 58 Z" fill="#FFF59D"/>`;
}

function indicatorFrame(turn: Turn): string {
  const lines = turn === "player" ? ["YOUR", "TURN"] : turn === "enemy" ? ["ENEMY", "TURN"] : ["FLEET", "SUNK"];
  const body = `${indicatorGlyph(turn)}
    <text x="72" y="118" font-family="Segoe UI, sans-serif" font-size="19" font-weight="800" text-anchor="middle" fill="#FFFFFF">${lines[0]}</text>
    <text x="72" y="136" font-family="Segoe UI, sans-serif" font-size="19" font-weight="800" text-anchor="middle" fill="#FFFFFF">${lines[1]}</text>`;
  return toDataUri(cellWrap(INDICATOR_BG[turn], body));
}

export function playerTurnFrame(): string {
  return indicatorFrame("player");
}

export function enemyTurnFrame(): string {
  return indicatorFrame("enemy");
}

export function fleetSunkFrame(): string {
  return indicatorFrame("win");
}
