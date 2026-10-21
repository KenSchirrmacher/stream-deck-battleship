import streamDeck from "@elgato/streamdeck";
import { CellAction } from "./actions/cell.js";
import { TurnIndicatorAction } from "./actions/turn-indicator.js";
import { ViewToggleAction } from "./actions/view-toggle.js";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new CellAction());
streamDeck.actions.registerAction(new TurnIndicatorAction());
streamDeck.actions.registerAction(new ViewToggleAction());

streamDeck.connect();
