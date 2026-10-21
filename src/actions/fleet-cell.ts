import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { gameEngine } from "../game/engine.js";

@action({ UUID: "com.homedeck.battleship.fleetcell" })
export class FleetCellAction extends SingletonAction {
  override onWillAppear(ev: WillAppearEvent): void {
    if (!ev.action.isKey()) return;
    const coords = ev.action.coordinates;
    if (!coords) return;
    gameEngine.registerFleetCell(ev.action.device.id, ev.action, coords.row, coords.column);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    gameEngine.unregisterFleetCell(ev.action.device.id, ev.action.id);
  }

  override onKeyDown(ev: KeyDownEvent): void {
    if (!ev.action.isKey()) return;
    gameEngine.handleFleetPress(ev.action.device.id, ev.action);
  }
}
