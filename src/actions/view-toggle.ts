import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { gameEngine } from "../game/engine.js";

@action({ UUID: "com.homedeck.battleship.viewtoggle" })
export class ViewToggleAction extends SingletonAction {
  override onWillAppear(ev: WillAppearEvent): void {
    if (!ev.action.isKey()) return;
    gameEngine.registerViewToggle(ev.action.device.id, ev.action);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    gameEngine.unregisterViewToggle(ev.action.device.id, ev.action.id);
  }

  override onKeyDown(ev: KeyDownEvent): void {
    if (!ev.action.isKey()) return;
    gameEngine.handleViewTogglePress(ev.action.device.id);
  }
}
