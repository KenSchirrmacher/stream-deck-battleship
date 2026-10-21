# Battleship for Stream Deck

A real two-grid Battleship match on your key grid. Place your 3-ship fleet on your own board,
then fire on the enemy's hidden board to win. A Turn Indicator key shows whose turn it is — and
doubles as the rotate button while you're placing ships. When it's the enemy's turn, their shots
land right on your own board a few seconds later so you can watch the attack unfold.

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
plugins can't create pages/profiles on your behalf. You build the two boards once, the same way
you'd lay out any other folder:

1. Create a folder (or a whole profile) on your Stream Deck and drag **Fleet Cell** (under the
   "Battleship" category) onto a solid rectangular block of keys — this is *your* board, where
   your ships live and the enemy fires at you. 3 wide x 4 tall works well.
2. Drag **Cell** (same category) onto a second solid rectangular block elsewhere on the page —
   this is the *enemy's* hidden board, where you fire. Also 3 wide x 4 tall works well. (Classic
   Battleship is 10x10 with 5 ships, but few Stream Decks have that many keys spare — this plugin
   ships a reduced 3-ship fleet, lengths 4/3/2, sized for much smaller boards; any rectangle at
   least 3x3 with a long side of 4+ works for either board.)
3. Drag one **Turn Indicator** (same category) onto a key near the top-left — it doesn't need to
   touch either grid, just be visible at a glance.
4. At the start of a game, the indicator reads "LEN 4 / HORIZ" and your Fleet board is all water.
   Press a cell to drop an anchor there — the ship previews extending right from it. Press the
   Turn Indicator to rotate the preview to vertical (extending down) and back. Press any
   previewed cell to confirm the ship where it sits, or press a different water cell to move the
   anchor instead. Pressing the most recently placed ship un-places it, in case you get boxed in.
   Repeat for all three ships (lengths 4, 3, 2).
5. Once your fleet is placed, the indicator reads "Your Turn" and the enemy board goes live.
   Press any cell there to fire — a miss ripples, a hit flames, and a fully-hit ship reveals
   itself with a green glow. The indicator then flips to "Enemy Turn" for 3-5 seconds; when it
   flips back, check your own Fleet board for where they just hit you (miss ripple, hit flame, or
   a ship sunk with an orange glow). Sink all three enemy ships to win ("Fleet Sunk"); lose all
   three of yours and it's "Fleet Lost". Either way the whole board resets itself a moment later
   for a rematch, fleet placement included.

**Handing the deck to a kid without worry:** put the board on its own folder page, and use Stream
Deck's built-in **Parent Folder** action (no plugin needed) on one key as the way out. Launch the
folder from your main page with the built-in **Create Folder** / navigation action.

## Game internals

- `src/game/engine.ts` — one shared state machine per Stream Deck device, tracking two
  independently-registered boards (fleet + water): the anchor/rotate/confirm placement flow,
  random non-overlapping fleet placement for the enemy, shot resolution (miss/hit/sunk) on both
  boards, the player/enemy turn clock with the enemy's own random targeting, and the pause before
  resetting.
- `src/game/render.ts` — all the key art (water, ship hull, placement preview, miss ripple, hit
  flame, sunk wreck in both victory-green and warning-orange, and all five Turn Indicator faces),
  generated at runtime.
- Tuning constants live at the top of `engine.ts`: `FLEET` (ship lengths), `ENEMY_TURN_MIN_MS` /
  `ENEMY_TURN_MAX_MS` (how long the enemy's turn takes), `END_RESET_MS` (how long the board holds
  after a win or loss before clearing), and `MIN_WIDTH` / `MIN_HEIGHT` (smallest grid either board
  will start on).

## License

MIT
