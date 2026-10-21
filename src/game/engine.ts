import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import {
  defeatFrame,
  enemyTurnFrame,
  hitFrame,
  missFrame,
  placementFrame,
  playerTurnFrame,
  selectingFrame,
  shipFrame,
  sunkFrameBad,
  sunkFrameGood,
  victoryFrame,
  waterFrame,
} from "./render.js";

const APPEAR_DEBOUNCE_MS = 400;
const END_RESET_MS = 3_500;
const ENEMY_TURN_MIN_MS = 3_000;
const ENEMY_TURN_MAX_MS = 5_000;
const MIN_WIDTH = 3;
const MIN_HEIGHT = 3;
const MAX_SHIP_LENGTH_SLACK = 0; // require board's longer side to fit the longest ship exactly or better

// Reduced 3-ship fleet (classic Battleship's 5 ships don't fit an 8x4 deck grid).
const FLEET: number[] = [4, 3, 2];
const MAX_PLACEMENT_ATTEMPTS = 2_000;

type CellStatus = "water" | "ship" | "selecting" | "hit" | "miss" | "sunk";
type Phase = "placement" | "player" | "enemy" | "win" | "lose";

type RegisteredCell = {
  action: KeyAction;
  row: number;
  col: number;
};

type Ship = {
  length: number;
  hitCount: number;
  cells: number[];
};

type Board = {
  cells: Map<string, RegisteredCell>;
  order: string[];
  width: number;
  height: number;
  started: boolean;
  status: CellStatus[];
  shipOfCell: number[];
  ships: Ship[];
  shipsRemaining: number;
  appearDebounce: ReturnType<typeof setTimeout> | null;
};

type Orientation = "horizontal" | "vertical";

type DeviceState = {
  fleet: Board;
  water: Board;
  indicatorAction: KeyAction | null;
  gameStarted: boolean;
  phase: Phase;
  placementShipIndex: number;
  placementAnchor: number | null;
  placementOrientation: Orientation;
  placementPreviewCells: number[] | null;
  resetTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
};

function freshBoard(): Board {
  return {
    cells: new Map(),
    order: [],
    width: 0,
    height: 0,
    started: false,
    status: [],
    shipOfCell: [],
    ships: [],
    shipsRemaining: 0,
    appearDebounce: null,
  };
}

function freshState(): DeviceState {
  return {
    fleet: freshBoard(),
    water: freshBoard(),
    indicatorAction: null,
    gameStarted: false,
    phase: "placement",
    placementShipIndex: 0,
    placementAnchor: null,
    placementOrientation: "horizontal",
    placementPreviewCells: null,
    resetTimer: null,
    turnTimer: null,
  };
}

class GameEngine {
  private devices = new Map<string, DeviceState>();

  // --- Registration -------------------------------------------------------

  registerFleetCell(deviceId: string, action: KeyAction, row: number, col: number): void {
    const state = this.getOrCreate(deviceId);
    state.fleet.cells.set(action.id, { action, row, col });
    void action.setImage(waterFrame()).catch((err) =>
      streamDeck.logger.error(`battleship: setImage(fleet water) failed for ${action.id}: ${String(err)}`),
    );
    this.scheduleBoardStart(state, state.fleet);
  }

  unregisterFleetCell(deviceId: string, actionId: string): void {
    const state = this.devices.get(deviceId);
    if (!state) return;
    state.fleet.cells.delete(actionId);
    this.maybeTeardown(deviceId, state);
  }

  registerWaterCell(deviceId: string, action: KeyAction, row: number, col: number): void {
    const state = this.getOrCreate(deviceId);
    state.water.cells.set(action.id, { action, row, col });
    void action.setImage(waterFrame()).catch((err) =>
      streamDeck.logger.error(`battleship: setImage(water) failed for ${action.id}: ${String(err)}`),
    );
    this.scheduleBoardStart(state, state.water);
  }

  unregisterWaterCell(deviceId: string, actionId: string): void {
    const state = this.devices.get(deviceId);
    if (!state) return;
    state.water.cells.delete(actionId);
    this.maybeTeardown(deviceId, state);
  }

  registerIndicator(deviceId: string, action: KeyAction): void {
    const state = this.getOrCreate(deviceId);
    state.indicatorAction = action;
    this.renderIndicator(state);
  }

  unregisterIndicator(deviceId: string, actionId: string): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.indicatorAction || state.indicatorAction.id !== actionId) return;
    state.indicatorAction = null;
    this.maybeTeardown(deviceId, state);
  }

  // --- Input ----------------------------------------------------------------

  handleFleetPress(deviceId: string, action: KeyAction): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.gameStarted || state.phase !== "placement") return;

    const idx = state.fleet.order.indexOf(action.id);
    if (idx < 0) return;
    const status = state.fleet.status[idx];

    // Pressing the most-recently-placed ship un-places it (an escape hatch if boxed in).
    if (status === "ship") {
      const shipIdx = state.fleet.shipOfCell[idx];
      if (shipIdx !== state.fleet.ships.length - 1) return;
      const ship = state.fleet.ships.pop()!;
      for (const c of ship.cells) {
        state.fleet.shipOfCell[c] = -1;
        state.fleet.status[c] = "water";
        this.renderBoardCell(state.fleet, c, waterFrame());
      }
      state.fleet.shipsRemaining--;
      state.placementShipIndex--;
      if (state.placementAnchor !== null) {
        this.clearPlacementPreview(state);
        state.placementAnchor = null;
      }
      this.renderIndicator(state);
      return;
    }

    // No anchor yet: this press becomes the ship's origin, extending right/down from it.
    if (state.placementAnchor === null) {
      if (status !== "water") return;
      state.placementAnchor = idx;
      this.updatePlacementPreview(state);
      return;
    }

    // Anchor is set: pressing any previewed cell confirms the placement there.
    if (state.placementPreviewCells && state.placementPreviewCells.includes(idx)) {
      const cells = state.placementPreviewCells;
      const length = FLEET[state.placementShipIndex];
      const shipIdx = state.fleet.ships.length;
      for (const c of cells) {
        state.fleet.shipOfCell[c] = shipIdx;
        state.fleet.status[c] = "ship";
        this.renderBoardCell(state.fleet, c, shipFrame());
      }
      state.fleet.ships.push({ length, hitCount: 0, cells });
      state.fleet.shipsRemaining++;
      state.placementShipIndex++;
      state.placementAnchor = null;
      state.placementPreviewCells = null;

      if (state.placementShipIndex === FLEET.length) {
        state.phase = "player";
      }
      this.renderIndicator(state);
      return;
    }

    // Pressing anywhere else moves the anchor there instead.
    this.clearPlacementPreview(state);
    if (state.fleet.status[idx] !== "water") {
      state.placementAnchor = null;
      return;
    }
    state.placementAnchor = idx;
    this.updatePlacementPreview(state);
  }

  /** Pressing the Turn Indicator during placement rotates the ship currently being positioned. */
  handleIndicatorPress(deviceId: string): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.gameStarted || state.phase !== "placement") return;

    state.placementOrientation = state.placementOrientation === "horizontal" ? "vertical" : "horizontal";
    if (state.placementAnchor !== null) this.updatePlacementPreview(state);
    this.renderIndicator(state);
  }

  handleWaterPress(deviceId: string, action: KeyAction): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.gameStarted || state.phase !== "player") return;

    const idx = state.water.order.indexOf(action.id);
    if (idx < 0 || state.water.status[idx] !== "water") return;

    const shipIdx = state.water.shipOfCell[idx];
    if (shipIdx < 0) {
      state.water.status[idx] = "miss";
      this.renderBoardCell(state.water, idx, missFrame());
    } else {
      const ship = state.water.ships[shipIdx];
      ship.hitCount++;
      if (ship.hitCount === ship.length) {
        for (const c of ship.cells) {
          state.water.status[c] = "sunk";
          this.renderBoardCell(state.water, c, sunkFrameGood());
        }
        state.water.shipsRemaining--;
      } else {
        state.water.status[idx] = "hit";
        this.renderBoardCell(state.water, idx, hitFrame());
      }
    }

    if (state.water.shipsRemaining === 0) {
      state.phase = "win";
      this.renderIndicator(state);
      state.resetTimer = setTimeout(() => this.newGame(state), END_RESET_MS);
      return;
    }

    state.phase = "enemy";
    this.renderIndicator(state);
    if (state.turnTimer) clearTimeout(state.turnTimer);
    const delay = ENEMY_TURN_MIN_MS + Math.floor(Math.random() * (ENEMY_TURN_MAX_MS - ENEMY_TURN_MIN_MS + 1));
    state.turnTimer = setTimeout(() => this.runEnemyTurn(state), delay);
  }

  private runEnemyTurn(state: DeviceState): void {
    state.turnTimer = null;
    if (state.phase !== "enemy") return;

    const candidates: number[] = [];
    for (let i = 0; i < state.fleet.status.length; i++) {
      if (state.fleet.status[i] === "water" || state.fleet.status[i] === "ship") candidates.push(i);
    }
    if (candidates.length === 0) {
      state.phase = "player";
      this.renderIndicator(state);
      return;
    }

    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    const shipIdx = state.fleet.shipOfCell[idx];
    if (shipIdx < 0) {
      state.fleet.status[idx] = "miss";
      this.renderBoardCell(state.fleet, idx, missFrame());
    } else {
      const ship = state.fleet.ships[shipIdx];
      ship.hitCount++;
      if (ship.hitCount === ship.length) {
        for (const c of ship.cells) {
          state.fleet.status[c] = "sunk";
          this.renderBoardCell(state.fleet, c, sunkFrameBad());
        }
        state.fleet.shipsRemaining--;
      } else {
        state.fleet.status[idx] = "hit";
        this.renderBoardCell(state.fleet, idx, hitFrame());
      }
    }

    if (state.fleet.shipsRemaining === 0) {
      state.phase = "lose";
      this.renderIndicator(state);
      state.resetTimer = setTimeout(() => this.newGame(state), END_RESET_MS);
      return;
    }

    state.phase = "player";
    this.renderIndicator(state);
  }

  // --- Placement geometry ---------------------------------------------------

  /** The anchor is always the top-left-most cell; the ship extends right (horizontal) or down (vertical). */
  private computePreviewCells(width: number, height: number, anchor: number, orientation: Orientation, length: number): number[] | null {
    const ar = Math.floor(anchor / width);
    const ac = anchor % width;
    if (orientation === "horizontal") {
      if (ac + length > width) return null;
      return Array.from({ length }, (_, i) => ar * width + ac + i);
    }
    if (ar + length > height) return null;
    return Array.from({ length }, (_, i) => (ar + i) * width + ac);
  }

  private clearPlacementPreview(state: DeviceState): void {
    if (state.placementPreviewCells) {
      for (const c of state.placementPreviewCells) {
        state.fleet.status[c] = "water";
        this.renderBoardCell(state.fleet, c, waterFrame());
      }
    } else if (state.placementAnchor !== null) {
      // anchor was set but had no valid preview at the current orientation
      state.fleet.status[state.placementAnchor] = "water";
      this.renderBoardCell(state.fleet, state.placementAnchor, waterFrame());
    }
    state.placementPreviewCells = null;
  }

  private updatePlacementPreview(state: DeviceState): void {
    if (state.placementAnchor === null) return;
    this.clearPlacementPreview(state);

    const length = FLEET[state.placementShipIndex];
    const cells = this.computePreviewCells(state.fleet.width, state.fleet.height, state.placementAnchor, state.placementOrientation, length);

    if (!cells || cells.some((c) => state.fleet.shipOfCell[c] !== -1)) {
      state.fleet.status[state.placementAnchor] = "selecting";
      this.renderBoardCell(state.fleet, state.placementAnchor, selectingFrame());
      state.placementPreviewCells = null;
      return;
    }

    state.placementPreviewCells = cells;
    for (const c of cells) {
      state.fleet.status[c] = "selecting";
      this.renderBoardCell(state.fleet, c, selectingFrame());
    }
  }

  private placeFleetRandom(board: Board): void {
    const total = board.width * board.height;
    board.shipOfCell = new Array(total).fill(-1);
    board.ships = [];

    for (const length of FLEET) {
      let placed = false;
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && !placed; attempt++) {
        const horizontal = Math.random() < 0.5;
        const rowChoices = horizontal ? board.height : board.height - length + 1;
        const colChoices = horizontal ? board.width - length + 1 : board.width;
        if (rowChoices <= 0 || colChoices <= 0) continue;

        const row = Math.floor(Math.random() * rowChoices);
        const col = Math.floor(Math.random() * colChoices);
        const cellIdxs: number[] = [];
        for (let i = 0; i < length; i++) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;
          cellIdxs.push(r * board.width + c);
        }
        if (cellIdxs.some((idx) => board.shipOfCell[idx] !== -1)) continue;

        const shipIdx = board.ships.length;
        for (const idx of cellIdxs) board.shipOfCell[idx] = shipIdx;
        board.ships.push({ length, hitCount: 0, cells: cellIdxs });
        placed = true;
      }
      if (!placed) {
        streamDeck.logger.warn(`battleship: couldn't place a ${length}-length ship on a ${board.width}x${board.height} board.`);
      }
    }
  }

  // --- Lifecycle --------------------------------------------------------------

  private renderBoardCell(board: Board, idx: number, image: string): void {
    const id = board.order[idx];
    const cell = board.cells.get(id);
    if (cell) void cell.action.setImage(image);
  }

  private renderIndicator(state: DeviceState): void {
    if (!state.indicatorAction) return;
    let image: string;
    switch (state.phase) {
      case "placement":
        image = placementFrame(FLEET[state.placementShipIndex] ?? FLEET[FLEET.length - 1], state.placementOrientation);
        break;
      case "player":
        image = playerTurnFrame();
        break;
      case "enemy":
        image = enemyTurnFrame();
        break;
      case "win":
        image = victoryFrame();
        break;
      case "lose":
        image = defeatFrame();
        break;
    }
    void state.indicatorAction.setImage(image).catch((err) =>
      streamDeck.logger.error(`battleship: setImage(indicator) failed: ${String(err)}`),
    );
  }

  private scheduleBoardStart(state: DeviceState, board: Board): void {
    if (board.appearDebounce) clearTimeout(board.appearDebounce);
    board.appearDebounce = setTimeout(() => {
      board.appearDebounce = null;
      if (board.started || board.cells.size === 0) return;

      const cells = [...board.cells.values()];
      const minRow = Math.min(...cells.map((c) => c.row));
      const maxRow = Math.max(...cells.map((c) => c.row));
      const minCol = Math.min(...cells.map((c) => c.col));
      const maxCol = Math.max(...cells.map((c) => c.col));
      const width = maxCol - minCol + 1;
      const height = maxRow - minRow + 1;
      const longestShip = FLEET[0];

      if (
        cells.length !== width * height ||
        width < MIN_WIDTH ||
        height < MIN_HEIGHT ||
        Math.max(width, height) + MAX_SHIP_LENGTH_SLACK < longestShip
      ) {
        streamDeck.logger.warn(
          `battleship: registered cells (${cells.length}) don't form a usable solid rectangle (${width}x${height}); not starting.`,
        );
        return;
      }

      const order = new Array<string>(width * height);
      for (const c of cells) {
        const idx = (c.row - minRow) * width + (c.col - minCol);
        order[idx] = c.action.id;
      }

      board.order = order;
      board.width = width;
      board.height = height;
      board.started = true;
      this.maybeBeginGame(state);
    }, APPEAR_DEBOUNCE_MS);
  }

  private maybeBeginGame(state: DeviceState): void {
    if (state.gameStarted || !state.fleet.started || !state.water.started) return;
    state.gameStarted = true;
    this.newGame(state);
  }

  private newGame(state: DeviceState): void {
    if (state.resetTimer) clearTimeout(state.resetTimer);
    if (state.turnTimer) clearTimeout(state.turnTimer);
    state.resetTimer = null;
    state.turnTimer = null;

    state.fleet.status = new Array(state.fleet.width * state.fleet.height).fill("water");
    state.fleet.shipOfCell = new Array(state.fleet.width * state.fleet.height).fill(-1);
    state.fleet.ships = [];
    state.fleet.shipsRemaining = 0;
    for (let i = 0; i < state.fleet.status.length; i++) this.renderBoardCell(state.fleet, i, waterFrame());

    state.water.status = new Array(state.water.width * state.water.height).fill("water");
    this.placeFleetRandom(state.water);
    state.water.shipsRemaining = state.water.ships.length;
    for (let i = 0; i < state.water.status.length; i++) this.renderBoardCell(state.water, i, waterFrame());

    state.placementShipIndex = 0;
    state.placementAnchor = null;
    state.placementOrientation = "horizontal";
    state.placementPreviewCells = null;
    state.phase = "placement";
    this.renderIndicator(state);
  }

  private maybeTeardown(deviceId: string, state: DeviceState): void {
    if (state.fleet.cells.size > 0 || state.water.cells.size > 0 || state.indicatorAction) return;
    if (state.fleet.appearDebounce) clearTimeout(state.fleet.appearDebounce);
    if (state.water.appearDebounce) clearTimeout(state.water.appearDebounce);
    if (state.resetTimer) clearTimeout(state.resetTimer);
    if (state.turnTimer) clearTimeout(state.turnTimer);
    this.devices.delete(deviceId);
  }

  private getOrCreate(deviceId: string): DeviceState {
    let state = this.devices.get(deviceId);
    if (!state) {
      state = freshState();
      this.devices.set(deviceId, state);
    }
    return state;
  }
}

export const gameEngine = new GameEngine();
