/**
 * Pressure measurement over `ctx.tokenMeter` (SPEC §6.2, §8).
 *
 * Prefers the durable `session.requestContext().contextWindow` when the host
 * has logged `request/context`. Falls back to `llm.resolveModelInfo` via
 * `session.requestHeader().config` when capacity is not yet folded into the
 * log. When neither is available, `contextWindow`/`ratio` stay undefined and
 * the trigger uses absolute token thresholds.
 */

import type { Session } from "@deepseek-ai/dsh-session";
import type {
  LlmRuntimeLike,
  PressureSnapshot,
  TokenMeterLike,
} from "./types.js";

/** Attach a positive context window and derived ratio onto a snapshot. */
function applyContextWindow(
  snapshot: PressureSnapshot,
  contextWindow: number | undefined,
): void {
  if (typeof contextWindow !== "number" || contextWindow <= 0) return;
  snapshot.contextWindow = contextWindow;
  if (typeof snapshot.totalTokens === "number") {
    snapshot.ratio = snapshot.totalTokens / contextWindow;
  }
}

/**
 * Measure the current session pressure. Never throws on capacity lookup
 * failures — an unresolvable window degrades the snapshot, it does not fail
 * the run (SPEC §4 fail-open).
 */
export async function measurePressure(
  session: Session,
  tokenMeter: TokenMeterLike,
  llm: LlmRuntimeLike | undefined,
  signal: AbortSignal | undefined,
): Promise<PressureSnapshot> {
  const measurement = tokenMeter.measure(session);
  const snapshot: PressureSnapshot = {
    estimatedSurfaceTokens: measurement.surfaceTokens,
    totalTokens: measurement.totalTokens,
  };

  // Prefer the logged request/context fold (sync, no LLM round-trip).
  try {
    applyContextWindow(snapshot, session.requestContext()?.contextWindow);
    if (snapshot.contextWindow !== undefined) return snapshot;
  } catch {
    // Partial mocks or hosts without the fold; fall through.
  }

  let provider: string | undefined;
  let model: string | undefined;
  try {
    const header = session.requestHeader();
    provider = header?.config.provider;
    model = header?.config.model;
  } catch {
    // Same fail-open path as a missing header.
  }

  if (
    typeof provider === "string" &&
    provider.length > 0 &&
    typeof model === "string" &&
    model.length > 0 &&
    llm !== undefined
  ) {
    try {
      const info = await llm.resolveModelInfo(provider, model, signal);
      applyContextWindow(snapshot, info.context?.contextWindow);
    } catch {
      // Capacity stays unknown; the trigger falls back to absolute tokens.
    }
  }
  return snapshot;
}

/** Newest-token pin window: per-node heuristic prices from the meter. */
export function surfaceNodeTokens(
  tokenMeter: TokenMeterLike,
  session: Session,
): Map<number, number> {
  const tokens = new Map<number, number>();
  try {
    for (const node of tokenMeter.measure(session).nodes) {
      tokens.set(node.seq, node.heuristicTokens);
    }
  } catch {
    // No per-node pricing available; the recent-tokens pin degrades to
    // the position pin only.
  }
  return tokens;
}
