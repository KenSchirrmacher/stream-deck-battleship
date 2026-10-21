# Battleship for Stream Deck

A real two-sided Battleship match on a single block of keys. Place your 3-ship fleet, then flip
between **My Fleet** and **Enemy Waters** with the View Toggle key to defend and attack on the
same grid -- no need to shrink either board to fit both on screen at once. A Turn Indicator key
shows whose turn it is (and doubles as the rotate button while you're placing ships), and the
game automatically switches your view to the right board each turn so you never miss a shot.

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

This plugin ships three actions and doesn't come with a prebuilt layout, because Stream Deck
plugins can't create pages/profiles on your behalf. You build it once, the same way you'd lay out
any other folder:

1. Create a folder (or a whole profile) on your Stream Deck and drag **Cell** (under the
   "Battleship" category) onto a solid rectangular block of keys — no gaps, no L-shapes. This one
   grid is shared by both boards; 7 wide x 4 tall fits a Stream Deck XL nicely. (Classic
   Battleship is 10x10 with 5 ships, but few Stream Decks have that many keys spare — this plugin
   ships a reduced 3-ship fleet, lengths 4/3/2, sized for much smaller boards; any rectangle at
   least 4x4 works.)
2. Drag one **Turn Indicator** and one **View Toggle** (same category) onto two keys near the
   top-left — neither needs to touch the grid itself, just be visible at a glance.
3. At the start of a game, the indicator reads "LEN 4 / HORIZ" and the grid shows your (empty)
   Fleet board. Press a cell to drop an anchor there — the ship previews extending right from it.
   Press the Turn Indicator to rotate the preview to vertical (extending down) and back. Press
   any previewed cell to confirm the ship where it sits, or press a different water cell to move
   the anchor instead. Pressing the most recently placed ship un-places it, in case you get boxed
   in. Repeat for all three ships (lengths 4, 3, 2).
4. Once your fleet is placed, the indicator reads "Your Turn" and the grid switches itself to
   Enemy Waters, live for firing. Press any cell to fire — a miss ripples, a hit flames, and a
   fully-hit ship reveals itself with a green glow. The indicator then flips to "Enemy Turn" and
   the grid automatically switches to My Fleet so you can watch the counterattack land a few
   seconds later (miss ripple, hit flame, or a ship sunk with an orange glow) — then it switches
   back to Enemy Waters and flips to "Your Turn" automatically. You can also press **View Toggle**
   anytime to peek at either board yourself.
5. Sink all three enemy ships to win ("Fleet Sunk"); lose all three of yours and it's "Fleet
   Lost". Either way the whole board resets itself a moment later for a rematch, fleet placement
   included.

**Handing the deck to a kid without worry:** put the board on its own folder page, and use Stream
Deck's built-in **Parent Folder** action (no plugin needed) on one key as the way out. Launch the
folder from your main page with the built-in **Create Folder** / navigation action.

## Game internals

- `src/game/engine.ts` — one shared state machine per Stream Deck device: a single physical grid
  registration shared by two independent logical boards (your fleet, the enemy's hidden waters),
  the anchor/rotate/confirm placement flow, random non-overlapping fleet placement for the enemy,
  shot resolution (miss/hit/sunk) on both boards, the player/enemy turn clock with the enemy's own
  random targeting and automatic view-switching, and the pause before resetting.
- `src/game/render.ts` — all the key art (water, ship hull, placement preview, miss ripple, hit
  flame, sunk wreck in both victory-green and warning-orange, all five Turn Indicator faces, and
  the two View Toggle faces), generated at runtime.
- Tuning constants live at the top of `engine.ts`: `FLEET` (ship lengths), `ENEMY_TURN_MIN_MS` /
  `ENEMY_TURN_MAX_MS` (how long the enemy's turn takes), `END_RESET_MS` (how long the board holds
  after a win or loss before clearing), and `MIN_WIDTH` / `MIN_HEIGHT` (smallest grid the plugin
  will start on).

## License

MIT
