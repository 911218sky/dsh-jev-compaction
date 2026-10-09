/**
 * Live decision.provider must switch the wire client without a plugin rebuild.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveJevCompactionConfig } from "./config.js";
import { createDecisionBackend } from "./service.js";

describe("createDecisionBackend", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("routes openai vs System One after a live provider change", async () => {
    process.env.OPENAI_API_KEY = "sk-test-router";
    process.env.TYPESAFE_API_KEY = "ts-test-router";

    let provider: "openai" | "typesafe" = "openai";
    const readConfig = () =>
      resolveJevCompactionConfig({
        decision:
          provider === "openai"
            ? {
                provider: "openai",
                openai: {
                  baseUrl: "https://openai.test/v1",
                  apiKeyEnv: "OPENAI_API_KEY",
                  model: "gpt-test",
                },
              }
            : {
                provider: "typesafe",
                typesafe: {
                  baseUrl: "https://typesafe.test/v1/systemone",
                  apiKeyEnv: "TYPESAFE_API_KEY",
                  model: "jev-latest",
                },
              },
      });

    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("systemone")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              answers: {
                needContents_c1: { noul: 0.1 },
                needVerbatim_c1: { noul: 0.1 },
              },
            }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answers: {
                      needContents_c1: { noul: 0.2 },
                      needVerbatim_c1: { noul: 0.2 },
                    },
                  }),
                },
              },
            ],
          }),
      };
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const backend = createDecisionBackend(readConfig);

    const state = { context: "c", goal: "g", history: [] };
    const questions = [
      { name: "needContents_c1", instructions: "need?" },
      { name: "needVerbatim_c1", instructions: "verbatim?" },
    ];

    provider = "openai";
    await backend.score(state, questions, undefined);
    expect(urls.at(-1)).toMatch(/openai\.test.*chat\/completions/);

    provider = "typesafe";
    await backend.score(state, questions, undefined);
    expect(urls.at(-1)).toMatch(/typesafe\.test.*systemone/);
  });
});
