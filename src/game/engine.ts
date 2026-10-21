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
  viewToggleFrame,
  waterFrame,
  type BoardView,
} from "./render.js";

const APPEAR_DEBOUNCE_MS = 400;
const END_RESET_MS = 3_500;
const ENEMY_TURN_MIN_MS = 3_000;
const ENEMY_TURN_MAX_MS = 5_000;
const MIN_WIDTH = 4;
const MIN_HEIGHT = 4;

// Reduced 3-ship fleet (classic Battleship's 5 ships don't fit an 8x4 deck grid).
const FLEET: number[] = [4, 3, 2];
const MAX_PLACEMENT_ATTEMPTS = 2_000;

type CellStatus = "water" | "ship" | "selecting" | "hit" | "miss" | "sunk";
type Phase = "placement" | "player" | "enemy" | "win" | "lose";
type Orientation = "horizontal" | "vertical";

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

/** The one physical block of keys, shared by both logical boards. */
type Grid = {
  cells: Map<string, RegisteredCell>;
  order: string[];
  width: number;
  height: number;
  started: boolean;
  appearDebounce: ReturnType<typeof setTimeout> | null;
};

/** A board's logical state -- not tied to any physical keys. */
type LogicalBoard = {
  status: CellStatus[];
  shipOfCell: number[];
  ships: Ship[];
  shipsRemaining: number;
};

function freshLogicalBoard(): LogicalBoard {
  return { status: [], shipOfCell: [], ships: [], shipsRemaining: 0 };
}

type DeviceState = {
  grid: Grid;
  fleet: LogicalBoard;
  waters: LogicalBoard;
  indicatorAction: KeyAction | null;
  viewToggleAction: KeyAction | null;
  gameStarted: boolean;
  phase: Phase;
  view: BoardView;
  placementShipIndex: number;
  placementAnchor: number | null;
  placementOrientation: Orientation;
  placementPreviewCells: number[] | null;
  resetTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
};

function freshState(): DeviceState {
  return {
    grid: { cells: new Map(), order: [], width: 0, height: 0, started: false, appearDebounce: null },
    fleet: freshLogicalBoard(),
    waters: freshLogicalBoard(),
    indicatorAction: null,
    viewToggleAction: null,
    gameStarted: false,
    phase: "placement",
    view: "fleet",
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

  registerCell(deviceId: string, action: KeyAction, row: number, col: number): void {
    const state = this.getOrCreate(deviceId);
    state.grid.cells.set(action.id, { action, row, col });
    void action.setImage(waterFrame()).catch((err) =>
      streamDeck.logger.error(`battleship: setImage(water) failed for ${action.id}: ${String(err)}`),
    );
    this.scheduleGridStart(state);
  }

  unregisterCell(deviceId: string, actionId: string): void {
    const state = this.devices.get(deviceId);
    if (!state) return;
    state.grid.cells.delete(actionId);
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

  registerViewToggle(deviceId: string, action: KeyAction): void {
    const state = this.getOrCreate(deviceId);
    state.viewToggleAction = action;
    this.renderViewToggle(state);
  }

  unregisterViewToggle(deviceId: string, actionId: string): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.viewToggleAction || state.viewToggleAction.id !== actionId) return;
    state.viewToggleAction = null;
    this.maybeTeardown(deviceId, state);
  }

  // --- Input ----------------------------------------------------------------

  handleCellPress(deviceId: string, action: KeyAction): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.gameStarted) return;

    const idx = state.grid.order.indexOf(action.id);
    if (idx < 0) return;

    if (state.phase === "placement") {
      this.handlePlacementPress(state, idx);
      return;
    }

    if (state.view === "waters" && state.phase === "player") {
      this.handleWaterFirePress(state, idx);
    }
    // Pressing fleet cells (your own board) outside placement is just a passive view -- no-op.
  }

  /** Pressing the Turn Indicator rotates the ship being placed; it's inert otherwise. */
  handleIndicatorPress(deviceId: string): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.gameStarted || state.phase !== "placement") return;

    state.placementOrientation = state.placementOrientation === "horizontal" ? "vertical" : "horizontal";
    if (state.placementAnchor !== null) this.updatePlacementPreview(state);
    this.renderIndicator(state);
  }

  /** Pressing View Toggle flips which board the shared grid displays/controls. Locked during placement. */
  handleViewTogglePress(deviceId: string): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.gameStarted || state.phase === "placement") return;

    state.view = state.view === "fleet" ? "waters" : "fleet";
    this.renderCurrentView(state);
    this.renderViewToggle(state);
  }

  // --- Placement --------------------------------------------------------------

  private handlePlacementPress(state: DeviceState, idx: number): void {
    const status = state.fleet.status[idx];

    // Pressing the most-recently-placed ship un-places it (an escape hatch if boxed in).
    if (status === "ship") {
      const shipIdx = state.fleet.shipOfCell[idx];
      if (shipIdx !== state.fleet.ships.length - 1) return;
      const ship = state.fleet.ships.pop()!;
      for (const c of ship.cells) {
        state.fleet.shipOfCell[c] = -1;
        state.fleet.status[c] = "water";
        this.renderGridCell(state, c, waterFrame());
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
        this.renderGridCell(state, c, shipFrame());
      }
      state.fleet.ships.push({ length, hitCount: 0, cells });
      state.fleet.shipsRemaining++;
      state.placementShipIndex++;
      state.placementAnchor = null;
      state.placementPreviewCells = null;

      if (state.placementShipIndex === FLEET.length) {
        state.phase = "player";
        state.view = "waters";
        this.renderCurrentView(state);
        this.renderViewToggle(state);
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
        this.renderGridCell(state, c, waterFrame());
      }
    } else if (state.placementAnchor !== null) {
      state.fleet.status[state.placementAnchor] = "water";
      this.renderGridCell(state, state.placementAnchor, waterFrame());
    }
    state.placementPreviewCells = null;
  }

  private updatePlacementPreview(state: DeviceState): void {
    if (state.placementAnchor === null) return;
    this.clearPlacementPreview(state);

    const length = FLEET[state.placementShipIndex];
    const cells = this.computePreviewCells(state.grid.width, state.grid.height, state.placementAnchor, state.placementOrientation, length);

    if (!cells || cells.some((c) => state.fleet.shipOfCell[c] !== -1)) {
      state.fleet.status[state.placementAnchor] = "selecting";
      this.renderGridCell(state, state.placementAnchor, selectingFrame());
      state.placementPreviewCells = null;
      return;
    }

    state.placementPreviewCells = cells;
    for (const c of cells) {
      state.fleet.status[c] = "selecting";
      this.renderGridCell(state, c, selectingFrame());
    }
  }

  // --- Battle -----------------------------------------------------------------

  private handleWaterFirePress(state: DeviceState, idx: number): void {
    if (state.waters.status[idx] !== "water") return;

    const shipIdx = state.waters.shipOfCell[idx];
    if (shipIdx < 0) {
      state.waters.status[idx] = "miss";
      this.renderGridCell(state, idx, missFrame());
    } else {
      const ship = state.waters.ships[shipIdx];
      ship.hitCount++;
      if (ship.hitCount === ship.length) {
        for (const c of ship.cells) {
          state.waters.status[c] = "sunk";
          this.renderGridCell(state, c, sunkFrameGood());
        }
        state.waters.shipsRemaining--;
      } else {
        state.waters.status[idx] = "hit";
        this.renderGridCell(state, idx, hitFrame());
      }
    }

    if (state.waters.shipsRemaining === 0) {
      state.phase = "win";
      this.renderIndicator(state);
      state.resetTimer = setTimeout(() => this.newGame(state), END_RESET_MS);
      return;
    }

    state.phase = "enemy";
    state.view = "fleet";
    this.renderCurrentView(state);
    this.renderViewToggle(state);
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
      state.view = "waters";
      this.renderCurrentView(state);
      this.renderViewToggle(state);
      this.renderIndicator(state);
      return;
    }

    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    const shipIdx = state.fleet.shipOfCell[idx];
    if (shipIdx < 0) {
      state.fleet.status[idx] = "miss";
      this.renderGridCell(state, idx, missFrame());
    } else {
      const ship = state.fleet.ships[shipIdx];
      ship.hitCount++;
      if (ship.hitCount === ship.length) {
        for (const c of ship.cells) {
          state.fleet.status[c] = "sunk";
          this.renderGridCell(state, c, sunkFrameBad());
        }
        state.fleet.shipsRemaining--;
      } else {
        state.fleet.status[idx] = "hit";
        this.renderGridCell(state, idx, hitFrame());
      }
    }

    if (state.fleet.shipsRemaining === 0) {
      state.phase = "lose";
      this.renderIndicator(state);
      state.resetTimer = setTimeout(() => this.newGame(state), END_RESET_MS);
      return;
    }

    state.phase = "player";
    state.view = "waters";
    this.renderCurrentView(state);
    this.renderViewToggle(state);
    this.renderIndicator(state);
  }

  private placeFleetRandom(board: LogicalBoard, width: number, height: number): void {
    const total = width * height;
    board.shipOfCell = new Array(total).fill(-1);
    board.ships = [];

    for (const length of FLEET) {
      let placed = false;
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && !placed; attempt++) {
        const horizontal = Math.random() < 0.5;
        const rowChoices = horizontal ? height : height - length + 1;
        const colChoices = horizontal ? width - length + 1 : width;
        if (rowChoices <= 0 || colChoices <= 0) continue;

        const row = Math.floor(Math.random() * rowChoices);
        const col = Math.floor(Math.random() * colChoices);
        const cellIdxs: number[] = [];
        for (let i = 0; i < length; i++) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;
          cellIdxs.push(r * width + c);
        }
        if (cellIdxs.some((idx) => board.shipOfCell[idx] !== -1)) continue;

        const shipIdx = board.ships.length;
        for (const idx of cellIdxs) board.shipOfCell[idx] = shipIdx;
        board.ships.push({ length, hitCount: 0, cells: cellIdxs });
        placed = true;
      }
      if (!placed) {
        streamDeck.logger.warn(`battleship: couldn't place a ${length}-length ship on a ${width}x${height} board.`);
      }
    }
  }

  // --- Rendering ----------------------------------------------------------------

  private renderGridCell(state: DeviceState, idx: number, image: string): void {
    const id = state.grid.order[idx];
    const cell = state.grid.cells.get(id);
    if (cell) void cell.action.setImage(image);
  }

  private frameFor(status: CellStatus, sunkVariant: "good" | "bad"): string {
    switch (status) {
      case "water":
        return waterFrame();
      case "ship":
        return shipFrame();
      case "selecting":
        return selectingFrame();
      case "miss":
        return missFrame();
      case "hit":
        return hitFrame();
      case "sunk":
        return sunkVariant === "good" ? sunkFrameGood() : sunkFrameBad();
    }
  }

  private renderCurrentView(state: DeviceState): void {
    const board = state.view === "fleet" ? state.fleet : state.waters;
    const sunkVariant = state.view === "fleet" ? "bad" : "good";
    for (let i = 0; i < board.status.length; i++) {
      this.renderGridCell(state, i, this.frameFor(board.status[i], sunkVariant));
    }
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

  private renderViewToggle(state: DeviceState): void {
    if (!state.viewToggleAction) return;
    void state.viewToggleAction.setImage(viewToggleFrame(state.view)).catch((err) =>
      streamDeck.logger.error(`battleship: setImage(viewToggle) failed: ${String(err)}`),
    );
  }

  // --- Lifecycle --------------------------------------------------------------

  private scheduleGridStart(state: DeviceState): void {
    const grid = state.grid;
    if (grid.appearDebounce) clearTimeout(grid.appearDebounce);
    grid.appearDebounce = setTimeout(() => {
      grid.appearDebounce = null;
      if (grid.started || grid.cells.size === 0) return;

      const cells = [...grid.cells.values()];
      const minRow = Math.min(...cells.map((c) => c.row));
      const maxRow = Math.max(...cells.map((c) => c.row));
      const minCol = Math.min(...cells.map((c) => c.col));
      const maxCol = Math.max(...cells.map((c) => c.col));
      const width = maxCol - minCol + 1;
      const height = maxRow - minRow + 1;

      if (cells.length !== width * height || width < MIN_WIDTH || height < MIN_HEIGHT) {
        streamDeck.logger.warn(
          `battleship: registered cells (${cells.length}) don't form a solid rectangle (${width}x${height}) of at least ${MIN_WIDTH}x${MIN_HEIGHT}; not starting.`,
        );
        return;
      }

      const order = new Array<string>(width * height);
      for (const c of cells) {
        const idx = (c.row - minRow) * width + (c.col - minCol);
        order[idx] = c.action.id;
      }

      grid.order = order;
      grid.width = width;
      grid.height = height;
      grid.started = true;
      state.gameStarted = true;
      this.newGame(state);
    }, APPEAR_DEBOUNCE_MS);
  }

  private newGame(state: DeviceState): void {
    if (state.resetTimer) clearTimeout(state.resetTimer);
    if (state.turnTimer) clearTimeout(state.turnTimer);
    state.resetTimer = null;
    state.turnTimer = null;

    const total = state.grid.width * state.grid.height;
    state.fleet = freshLogicalBoard();
    state.fleet.status = new Array(total).fill("water");
    state.fleet.shipOfCell = new Array(total).fill(-1);

    state.waters = freshLogicalBoard();
    state.waters.status = new Array(total).fill("water");
    this.placeFleetRandom(state.waters, state.grid.width, state.grid.height);
    state.waters.shipsRemaining = state.waters.ships.length;

    state.placementShipIndex = 0;
    state.placementAnchor = null;
    state.placementOrientation = "horizontal";
    state.placementPreviewCells = null;
    state.phase = "placement";
    state.view = "fleet";

    this.renderCurrentView(state);
    this.renderViewToggle(state);
    this.renderIndicator(state);
  }

  private maybeTeardown(deviceId: string, state: DeviceState): void {
    if (state.grid.cells.size > 0 || state.indicatorAction || state.viewToggleAction) return;
    if (state.grid.appearDebounce) clearTimeout(state.grid.appearDebounce);
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
