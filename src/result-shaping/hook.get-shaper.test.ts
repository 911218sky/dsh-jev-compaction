/**
 * Live getShaper: archive/root rebuilds must be visible without re-registering.
 */
import { describe, expect, it, vi } from "vitest";

import { resolveJevCompactionConfig } from "../config.js";
import { createPostExecuteListener } from "./hook.js";
import type { ImmediateResultShaper } from "./shaper.js";

describe("createPostExecuteListener getShaper", () => {
  it("calls the current shaper after the getter target is replaced", async () => {
    const shapedA = vi.fn(async () => undefined);
    const shapedB = vi.fn(async () => undefined);
    const shaperA = { maybeShape: shapedA } as unknown as ImmediateResultShaper;
    const shaperB = { maybeShape: shapedB } as unknown as ImmediateResultShaper;
    let current = shaperA;

    const config = resolveJevCompactionConfig({
      resultShaping: { enabled: true },
    });
    const listener = createPostExecuteListener({
      getShaper: () => current,
      readConfig: () => config,
      reserveBudget: () => true,
      goalFor: () => "goal",
      onSkip: () => undefined,
    });

    const exec = {
      name: "bash",
      callId: "c1",
      arguments: {},
      signal: undefined,
      agent: undefined,
      parent: undefined,
    };
    const result = {
      isError: false,
      content: [{ type: "text", text: "x" }],
    };
    const accept = {
      kind: "accept" as const,
      content: result.content,
    };

    await listener(exec as never, result as never, async () => accept);
    expect(shapedA).toHaveBeenCalledOnce();
    expect(shapedB).not.toHaveBeenCalled();

    current = shaperB;
    await listener(exec as never, result as never, async () => accept);
    expect(shapedB).toHaveBeenCalledOnce();
  });
});
