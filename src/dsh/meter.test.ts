/**
 * Pressure measurement prefers logged request/context capacity over LLM lookup.
 */
import { describe, expect, it, vi } from "vitest";

import { measurePressure } from "./meter.js";
import type { LlmRuntimeLike, TokenMeterLike } from "./types.js";

function meterStub(tokens = 1000): TokenMeterLike {
  return {
    measure: () => ({
      totalTokens: tokens,
      surfaceTokens: tokens,
      nodes: [],
    }),
    estimateMessage: () => 0,
  };
}

describe("measurePressure", () => {
  it("uses session.requestContext().contextWindow when present", async () => {
    const llm: LlmRuntimeLike = {
      resolveModelInfo: vi.fn(async () => ({
        context: { contextWindow: 999_999 },
      })),
    };
    const session = {
      requestContext: () => ({
        provider: "p",
        model: "m",
        contextWindow: 128_000,
      }),
      requestHeader: () => ({ config: { provider: "p", model: "m" } }),
    };
    const snapshot = await measurePressure(
      session as never,
      meterStub(64_000),
      llm,
      undefined,
    );
    expect(snapshot.contextWindow).toBe(128_000);
    expect(snapshot.ratio).toBeCloseTo(0.5);
    expect(llm.resolveModelInfo).not.toHaveBeenCalled();
  });

  it("falls back to llm.resolveModelInfo via requestHeader", async () => {
    const llm: LlmRuntimeLike = {
      resolveModelInfo: vi.fn(async () => ({
        context: { contextWindow: 200_000 },
      })),
    };
    const session = {
      requestContext: () => ({ provider: "p", model: "m" }),
      requestHeader: () => ({ config: { provider: "openai", model: "gpt" } }),
    };
    const snapshot = await measurePressure(
      session as never,
      meterStub(50_000),
      llm,
      undefined,
    );
    expect(snapshot.contextWindow).toBe(200_000);
    expect(llm.resolveModelInfo).toHaveBeenCalledWith(
      "openai",
      "gpt",
      undefined,
    );
  });

  it("leaves contextWindow undefined when capacity is unknown", async () => {
    const snapshot = await measurePressure(
      {
        requestContext: () => undefined,
        requestHeader: () => undefined,
      } as never,
      meterStub(10),
      undefined,
      undefined,
    );
    expect(snapshot.contextWindow).toBeUndefined();
    expect(snapshot.ratio).toBeUndefined();
    expect(snapshot.estimatedSurfaceTokens).toBe(10);
  });
});
