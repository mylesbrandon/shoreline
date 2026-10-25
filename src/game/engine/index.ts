/**
 * PUBLIC ENGINE API. OWNER: Developer 1.
 *
 * Other modules import ONLY from "@/game/engine" (this file), never from internal files.
 * The engine is pure TypeScript: no React, no Supabase, no DOM, no Date.now(), no Math.random().
 */
import type { ActionRejectReason, GameEvent, GameState, PlayerAction, RoleViews, SpectatorView } from "../types";
import { applyAction, type SenderRole } from "./actions";
import { createInitialState, type CreateStateOptions } from "./state";
import { step } from "./step";
import { getRoleViews, getSpectatorView } from "./views";

export { createInitialState, type CreateStateOptions } from "./state";
export { applyAction, validateAction, type ActionResult, type SenderRole } from "./actions";
export { step, type StepResult } from "./step";
export {
  getCaptainView,
  getRadioView,
  getRoleView,
  getRoleViews,
  getSonarView,
  getSpectatorView,
  getWeatherView,
} from "./views";
export { createRng, randomBetween, type Rng } from "./rng";
/** 2v2 "Rescue Showdown": two co-op worlds behind one match clock (see src/game/versus/contract.ts). */
export { versusEngine } from "./versus";

/**
 * The engine as an object — this is what the host session (src/lib/game-client) depends on,
 * so tests can inject a fake engine.
 */
export interface GameEngine {
  createInitialState(options: CreateStateOptions): GameState;
  applyAction(
    state: GameState,
    action: PlayerAction,
    sender: SenderRole | null,
  ): { state: GameState; events: GameEvent[]; rejected: ActionRejectReason | null };
  step(state: GameState, dtMs: number): { state: GameState; events: GameEvent[] };
  getRoleViews(state: GameState): RoleViews;
  getSpectatorView(state: GameState): SpectatorView;
}

export const engine: GameEngine = { createInitialState, applyAction, step, getRoleViews, getSpectatorView };
