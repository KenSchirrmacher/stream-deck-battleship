# Battleship for Stream Deck

A hidden 3-ship fleet is hiding somewhere on your key grid. Press a key to fire at it — a miss
shows a ripple, a hit shows a flame, and sinking a ship reveals the whole thing with a green
glow. Sink the fleet to win. A Turn Indicator key up top switches to "Enemy Turn" for a few
seconds of suspense after every shot before handing control back to you.

All the key art is generated as plain SVG at runtime — no image files.

## Build

```
npm install
npm run build
npx @elgato/cli link com.homedeck.battleship.sdPlugin
```

Dev watch: `npm run watch`

If `npm run build` fails on `sharp` (native binary), just re-run `npm install` once — sharp
downloads a prebuilt binary for your platform on install.

## Setting it up

This plugin ships two actions and doesn't come with a prebuilt layout, because Stream Deck
plugins can't create pages/profiles on your behalf. You build the board once, the same way
you'd lay out any other folder:

1. Create a folder (or a whole profile) on your Stream Deck and drag **Cell** (under the
   "Battleship" category) onto a solid rectangular block of keys — no gaps, no L-shapes. The
   plugin reads each key's actual position on the deck to build the grid; 7 wide x 4 tall fits
   an 8x4 Stream Deck XL nicely (classic Battleship is 10x10 with 5 ships, but few Stream Decks
   have that many keys spare — this plugin ships a reduced 3-ship fleet sized for a much
   smaller grid; any rectangle at least 4x3 works).
2. Drag one **Turn Indicator** (same category) onto a key near the top-left of your grid — it
   doesn't need to touch the grid itself, just be visible at a glance.
3. Press any grid key to fire at it. A miss ripples, a hit flames, and a fully-hit ship reveals
   itself with a green glow. After your shot the indicator flips to "Enemy Turn" for 3-5 seconds
   before flipping back to "Your Turn". Sink all three ships to win — the indicator reads "Fleet
   Sunk" and the whole board resets itself a moment later for a rematch.

**Handing the deck to a kid without worry:** put the board on its own folder page, and use Stream
Deck's built-in **Parent Folder** action (no plugin needed) on one key as the way out. Launch the
folder from your main page with the built-in **Create Folder** / navigation action.

## Game internals

- `src/game/engine.ts` — one shared state machine per Stream Deck device: random non-overlapping
  fleet placement, shot resolution (miss/hit/sunk), the player/enemy turn clock, and the pause
  before resetting.
- `src/game/render.ts` — all the key art (water, miss ripple, hit flame, sunk wreck, and the
  three Turn Indicator faces), generated at runtime.
- Tuning constants live at the top of `engine.ts`: `FLEET` (ship lengths), `ENEMY_TURN_MIN_MS` /
  `ENEMY_TURN_MAX_MS` (how long the enemy's turn takes), `WIN_RESET_MS` (how long the board holds
  after victory before clearing), and `MIN_WIDTH` / `MIN_HEIGHT` (smallest grid the plugin will
  start on).

## License

MIT
