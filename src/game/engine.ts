import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import {
  enemyTurnFrame,
  fleetSunkFrame,
  hitFrame,
  missFrame,
  playerTurnFrame,
  sunkFrame,
  waterFrame,
  type Turn,
} from "./render.js";

const APPEAR_DEBOUNCE_MS = 400;
const WIN_RESET_MS = 3_000;
const ENEMY_TURN_MIN_MS = 3_000;
const ENEMY_TURN_MAX_MS = 5_000;
const MIN_WIDTH = 4;
const MIN_HEIGHT = 3;

// Reduced 3-ship fleet (classic Battleship's 5 ships don't fit an 8x4 deck grid).
const FLEET: number[] = [4, 3, 2];
const MAX_PLACEMENT_ATTEMPTS = 500;

type CellStatus = "water" | "miss" | "hit" | "sunk";

type CellState = {
  action: KeyAction;
  row: number;
  col: number;
};

type Ship = {
  length: number;
  hitCount: number;
  cells: number[];
};

type DeviceState = {
  cells: Map<string, CellState>;
  boardOrder: string[];
  width: number;
  height: number;
  started: boolean;
  gameOver: boolean;
  cellStatus: CellStatus[];
  shipOfCell: number[];
  ships: Ship[];
  shipsRemaining: number;
  turn: Turn;
  indicatorAction: KeyAction | null;
  appearDebounce: ReturnType<typeof setTimeout> | null;
  resetTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
};

function freshState(): DeviceState {
  return {
    cells: new Map(),
    boardOrder: [],
    width: 0,
    height: 0,
    started: false,
    gameOver: false,
    cellStatus: [],
    shipOfCell: [],
    ships: [],
    shipsRemaining: 0,
    turn: "player",
    indicatorAction: null,
    appearDebounce: null,
    resetTimer: null,
    turnTimer: null,
  };
}

class GameEngine {
  private devices = new Map<string, DeviceState>();

  registerCell(deviceId: string, action: KeyAction, row: number, col: number): void {
    const state = this.getOrCreate(deviceId);
    state.cells.set(action.id, { action, row, col });
    void action.setImage(waterFrame()).catch((err) =>
      streamDeck.logger.error(`battleship: setImage(water) failed for ${action.id}: ${String(err)}`),
    );
    this.scheduleStart(state);
  }

  unregisterCell(deviceId: string, actionId: string): void {
    const state = this.devices.get(deviceId);
    if (!state) return;
    state.cells.delete(actionId);
    if (state.cells.size === 0 && !state.indicatorAction) {
      this.teardown(deviceId, state);
    }
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
    if (state.cells.size === 0) {
      this.teardown(deviceId, state);
    }
  }

  handlePress(deviceId: string, action: KeyAction): void {
    const state = this.devices.get(deviceId);
    if (!state || !state.started || state.gameOver || state.turn !== "player") return;

    const idx = state.boardOrder.indexOf(action.id);
    if (idx < 0 || state.cellStatus[idx] !== "water") return;

    const shipIdx = state.shipOfCell[idx];
    if (shipIdx < 0) {
      state.cellStatus[idx] = "miss";
      this.renderCell(state, idx, missFrame());
    } else {
      const ship = state.ships[shipIdx];
      ship.hitCount++;
      if (ship.hitCount === ship.length) {
        for (const cellIdx of ship.cells) {
          state.cellStatus[cellIdx] = "sunk";
          this.renderCell(state, cellIdx, sunkFrame());
        }
        state.shipsRemaining--;
      } else {
        state.cellStatus[idx] = "hit";
        this.renderCell(state, idx, hitFrame());
      }
    }

    if (state.shipsRemaining === 0) {
      state.gameOver = true;
      state.turn = "win";
      this.renderIndicator(state);
      state.resetTimer = setTimeout(() => this.newGame(state), WIN_RESET_MS);
      return;
    }

    state.turn = "enemy";
    this.renderIndicator(state);
    if (state.turnTimer) clearTimeout(state.turnTimer);
    const delay = ENEMY_TURN_MIN_MS + Math.floor(Math.random() * (ENEMY_TURN_MAX_MS - ENEMY_TURN_MIN_MS + 1));
    state.turnTimer = setTimeout(() => {
      state.turnTimer = null;
      if (state.gameOver) return;
      state.turn = "player";
      this.renderIndicator(state);
    }, delay);
  }

  private renderCell(state: DeviceState, idx: number, image: string): void {
    const id = state.boardOrder[idx];
    const cell = state.cells.get(id);
    if (cell) void cell.action.setImage(image);
  }

  private renderIndicator(state: DeviceState): void {
    if (!state.indicatorAction) return;
    const image = state.turn === "player" ? playerTurnFrame() : state.turn === "enemy" ? enemyTurnFrame() : fleetSunkFrame();
    void state.indicatorAction.setImage(image).catch((err) =>
      streamDeck.logger.error(`battleship: setImage(indicator) failed: ${String(err)}`),
    );
  }

  private scheduleStart(state: DeviceState): void {
    if (state.appearDebounce) clearTimeout(state.appearDebounce);
    state.appearDebounce = setTimeout(() => {
      state.appearDebounce = null;
      if (state.started || state.cells.size === 0) return;

      const cells = [...state.cells.values()];
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

      const boardOrder = new Array<string>(width * height);
      for (const c of cells) {
        const idx = (c.row - minRow) * width + (c.col - minCol);
        boardOrder[idx] = c.action.id;
      }

      state.boardOrder = boardOrder;
      state.width = width;
      state.height = height;
      state.started = true;
      this.newGame(state);
    }, APPEAR_DEBOUNCE_MS);
  }

  private placeFleet(state: DeviceState): void {
    const total = state.width * state.height;
    state.shipOfCell = new Array(total).fill(-1);
    state.ships = [];

    for (const length of FLEET) {
      let placed = false;
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && !placed; attempt++) {
        const horizontal = Math.random() < 0.5;
        const maxRow = horizontal ? state.height : state.height - length;
        const maxCol = horizontal ? state.width - length : state.width;
        if (maxRow <= 0 || maxCol <= 0) continue;

        const row = Math.floor(Math.random() * maxRow);
        const col = Math.floor(Math.random() * maxCol);
        const cellIdxs: number[] = [];
        for (let i = 0; i < length; i++) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;
          cellIdxs.push(r * state.width + c);
        }
        if (cellIdxs.some((idx) => state.shipOfCell[idx] !== -1)) continue;

        const shipIdx = state.ships.length;
        for (const idx of cellIdxs) state.shipOfCell[idx] = shipIdx;
        state.ships.push({ length, hitCount: 0, cells: cellIdxs });
        placed = true;
      }
      if (!placed) {
        streamDeck.logger.warn(`battleship: couldn't place a ${length}-length ship on a ${state.width}x${state.height} board.`);
      }
    }
  }

  private newGame(state: DeviceState): void {
    if (state.resetTimer) clearTimeout(state.resetTimer);
    if (state.turnTimer) clearTimeout(state.turnTimer);
    state.resetTimer = null;
    state.turnTimer = null;

    const total = state.width * state.height;
    state.cellStatus = new Array(total).fill("water");
    this.placeFleet(state);
    state.shipsRemaining = state.ships.length;
    state.gameOver = false;
    state.turn = "player";

    for (let i = 0; i < total; i++) this.renderCell(state, i, waterFrame());
    this.renderIndicator(state);
  }

  private teardown(deviceId: string, state: DeviceState): void {
    if (state.appearDebounce) clearTimeout(state.appearDebounce);
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
