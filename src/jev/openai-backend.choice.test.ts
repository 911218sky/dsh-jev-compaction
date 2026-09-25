/**
 * this-that model ids must use json_schema choice scoring only.
 */
import { describe, expect, it, vi } from "vitest";
import { OpenAIChatDecisionClient } from "./openai-backend.js";
import { resolveJevCompactionConfig } from "../config.js";

function flockChoiceConfig(model: string) {
  return resolveJevCompactionConfig({
    enabled: true,
    decision: {
      provider: "openai",
      openai: {
        baseUrl: "https://api.flock.io/v1",
        apiKeyEnv: "FLOCK_API_KEY",
        model,
      },
    },
  });
}

describe("FLock this-that choice protocol", () => {
  it("routes this-that-model-1.0 to json_schema choice, not json_object LLM scoring", async () => {
    process.env.FLOCK_API_KEY = "sk-test-choice-only";
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ answer: "yes" }) } },
            ],
            this_that: {
              choice: "yes",
              probabilities: { yes: 0.88, no: 0.12 },
              confidence: 0.88,
            },
          }),
      } as Response;
    });

    const client = new OpenAIChatDecisionClient(
      () => flockChoiceConfig("this-that-model-1.0"),
      fetchMock as unknown as typeof fetch,
    );

    const answers = await client.score(
      {
        context: "coding agent",
        goal: "prune stale tool results",
        history: [{ label: "bash", text: "ls output from turn 1" }],
      },
      [
        {
          name: "need_ls",
          instructions: "Is this ls output still needed?",
        },
      ],
      undefined,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodies[0] as {
      model: string;
      response_format: {
        type: string;
        json_schema?: { name: string; strict?: boolean };
      };
      messages: unknown[];
    };
    expect(body.model).toBe("this-that-model-1.0");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema?.name).toBe("choice");
    expect(body.response_format.json_schema?.strict).toBe(true);
    // Must NOT be free-form LLM scoring
    expect(body.response_format.type).not.toBe("json_object");
    expect(JSON.stringify(body)).not.toContain('"type":"json_object"');
    expect(answers.get("need_ls")).toBeCloseTo(0.88, 5);
  });

  it("non-this-that models may use json_object LLM path", async () => {
    process.env.FLOCK_API_KEY = "sk-test-choice-only";
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answers: { q1: { noul: 0.2 } },
                  }),
                },
              },
            ],
          }),
      } as Response;
    });

    const client = new OpenAIChatDecisionClient(
      () => flockChoiceConfig("gpt-4o-mini"),
      fetchMock as unknown as typeof fetch,
    );
    await client.score(
      { context: "c", goal: "g", history: [] },
      [{ name: "q1", instructions: "needed?" }],
      undefined,
    );
    const body = bodies[0] as { response_format: { type: string } };
    expect(body.response_format.type).toBe("json_object");
  });
});
