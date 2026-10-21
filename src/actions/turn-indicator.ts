import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { gameEngine } from "../game/engine.js";

@action({ UUID: "com.homedeck.battleship.turnindicator" })
export class TurnIndicatorAction extends SingletonAction {
  override onWillAppear(ev: WillAppearEvent): void {
    if (!ev.action.isKey()) return;
    gameEngine.registerIndicator(ev.action.device.id, ev.action);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    gameEngine.unregisterIndicator(ev.action.device.id, ev.action.id);
  }

  override onKeyDown(ev: KeyDownEvent): void {
    if (!ev.action.isKey()) return;
    gameEngine.handleIndicatorPress(ev.action.device.id);
  }
}
