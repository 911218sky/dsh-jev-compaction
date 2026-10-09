/**
 * Retry delay must reject immediately when the caller signal is already aborted.
 */
import { describe, expect, it, vi } from "vitest";

import { resolveJevCompactionConfig } from "../config.js";
import { JevTransportError, SystemOneClient } from "./backend.js";
import { OpenAIChatDecisionClient } from "./openai-backend.js";

describe("decision backend retry delay", () => {
  it("SystemOneClient does not wait when signal is already aborted before retry", async () => {
    process.env.TYPESAFE_API_KEY = "ts-delay-test";
    const config = resolveJevCompactionConfig({
      decision: {
        provider: "typesafe",
        typesafe: {
          baseUrl: "https://typesafe.test/v1/systemone",
          apiKeyEnv: "TYPESAFE_API_KEY",
          model: "jev-latest",
        },
      },
      jev: { retries: 1, timeoutMs: 5000 },
    });

    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      throw new TypeError("fetch failed");
    });
    const client = new SystemOneClient(config, fetchMock);
    const signal = AbortSignal.abort(new Error("cancelled by caller"));

    const started = Date.now();
    await expect(
      client.score(
        { context: "c", goal: "g", history: [] },
        [{ name: "needContents_c1", instructions: "need?" }],
        signal,
      ),
    ).rejects.toBeInstanceOf(JevTransportError);
    expect(Date.now() - started).toBeLessThan(150);
    expect(attempts).toBe(1);
  });

  it("OpenAIChatDecisionClient does not wait when signal is already aborted before retry", async () => {
    process.env.OPENAI_API_KEY = "sk-delay-test";
    const config = resolveJevCompactionConfig({
      decision: {
        provider: "openai",
        openai: {
          baseUrl: "https://openai.test/v1",
          apiKeyEnv: "OPENAI_API_KEY",
          model: "gpt-test",
        },
      },
      jev: { retries: 1, timeoutMs: 5000 },
    });

    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      throw new TypeError("fetch failed");
    });
    const client = new OpenAIChatDecisionClient(config, fetchMock);
    const signal = AbortSignal.abort(new Error("cancelled by caller"));

    const started = Date.now();
    await expect(
      client.score(
        { context: "c", goal: "g", history: [] },
        [{ name: "needContents_c1", instructions: "need?" }],
        signal,
      ),
    ).rejects.toBeInstanceOf(JevTransportError);
    expect(Date.now() - started).toBeLessThan(150);
    expect(attempts).toBe(1);
  });
});
