/**
 * OpenAI-compatible chat/completions decision backend.
 *
 * Speaks the same SystemOneBackend contract as System One clients, but
 * scores candidates by prompting any OpenAI-compatible gateway (OpenAI, FLock,
 * LiteLLM proxies, self-hosted vLLM, …). Fail-open: malformed JSON or HTTP
 * errors surface as transport/invalid-response errors for the service to skip.
 */

import type { ResolvedJevCompactionConfig } from "../config.js";
import {
  JevApiKeyMissingError,
  JevTransportError,
  type FetchLike,
} from "./backend.js";
import { JevInvalidResponseError } from "./validate.js";
import type {
  JevAnswers,
  JevQuestion,
  JevState,
  SystemOneBackend,
} from "./types.js";

/** Normalize `…/v1` or `…/v1/` into the chat completions URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  if (trimmed === "") {
    throw new JevTransportError("openai baseUrl is empty");
  }
  if (/\/chat\/completions$/u.test(trimmed)) return trimmed;
  if (/\/v1$/u.test(trimmed)) return `${trimmed}/chat/completions`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === "" || parsed.pathname === "/") {
      return `${trimmed}/v1/chat/completions`;
    }
  } catch {
    // leave absolute-path handling to fetch
  }
  return `${trimmed}/chat/completions`;
}

function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortController {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("jev request timed out")),
    timeoutMs,
  );
  const onAbort = (): void => controller.abort(signal?.reason);
  if (signal !== undefined) {
    if (signal.aborted) {
      clearTimeout(timer);
      controller.abort(signal.reason);
      return controller;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      if (signal !== undefined) signal.removeEventListener("abort", onAbort);
    },
    { once: true },
  );
  return controller;
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal !== undefined) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new JevTransportError("cancelled"));
        },
        { once: true },
      );
    }
  });
}

function buildPrompt(
  state: JevState,
  questions: readonly JevQuestion[],
): string {
  const history = state.history
    .map((entry) => `- ${entry.label}: ${entry.text}`)
    .join("\n");
  const qs = questions
    .map(
      (q, i) =>
        `${i + 1}. name=${JSON.stringify(q.name)}\n   instructions: ${q.instructions}`,
    )
    .join("\n");
  return [
    "You score whether historical tool results are still needed in a coding-agent context.",
    "Reply with ONLY a JSON object of this exact shape:",
    '{"answers":{"<question-name>":{"noul":<number 0..1>},...}}',
    "noul is P(yes) for the yes/no instructions. No markdown fences.",
    "",
    `context: ${state.context}`,
    `goal: ${state.goal}`,
    "history:",
    history || "(empty)",
    "",
    "questions:",
    qs,
  ].join("\n");
}

function parseChatAnswers(
  text: string,
  questions: readonly JevQuestion[],
): JevAnswers {
  let raw: unknown;
  try {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
    raw = JSON.parse(fence ? fence[1].trim() : trimmed);
  } catch (error: unknown) {
    throw new JevInvalidResponseError(
      `openai decision JSON parse failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!raw || typeof raw !== "object") {
    throw new JevInvalidResponseError("openai decision root must be an object");
  }
  const root = raw as Record<string, unknown>;
  const answersRaw =
    root.answers && typeof root.answers === "object"
      ? (root.answers as Record<string, unknown>)
      : root;
  const out: JevAnswers = new Map();
  for (const question of questions) {
    const entry = answersRaw[question.name];
    let noul: unknown;
    if (typeof entry === "number") noul = entry;
    else if (entry && typeof entry === "object") {
      noul = (entry as Record<string, unknown>).noul;
    }
    if (typeof noul !== "number" || !Number.isFinite(noul)) {
      throw new JevInvalidResponseError(
        `openai decision missing noul for ${question.name}`,
      );
    }
    out.set(question.name, Math.min(1, Math.max(0, noul)));
  }
  return out;
}

function messageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join("");
  }
  return "";
}

/** Live OpenAI-compatible chat decision backend. */
export class OpenAIChatDecisionClient implements SystemOneBackend {
  private readonly configSource: () => ResolvedJevCompactionConfig;
  private readonly fetcher: FetchLike;

  constructor(
    config: ResolvedJevCompactionConfig | (() => ResolvedJevCompactionConfig),
    fetcher: FetchLike = fetch as never,
  ) {
    this.configSource = typeof config === "function" ? config : () => config;
    this.fetcher = fetcher;
  }

  private get config(): ResolvedJevCompactionConfig {
    return this.configSource();
  }

  /** Choice models (e.g. this-that-*) pick among enums and may return probabilities. */
  private useChoiceProtocol(): boolean {
    const model = this.config.jev.model.toLowerCase();
    return model.includes("this-that") || model.includes("this_that");
  }

  private apiKey(): string | undefined {
    const envName = this.config.jev.apiKeyEnv;
    if (envName.length === 0) return undefined;
    const value = process.env[envName];
    if (typeof value !== "string" || value.length === 0) {
      throw new JevApiKeyMissingError(
        envName,
        this.config.decision.provider,
        chatCompletionsUrl(this.config.jev.baseUrl),
      );
    }
    return value;
  }

  private async attempt(
    state: JevState,
    questions: readonly JevQuestion[],
    signal: AbortSignal | undefined,
  ): Promise<JevAnswers> {
    const apiKey = this.apiKey();
    const controller = withTimeout(signal, this.config.jev.timeoutMs);
    const endpoint = chatCompletionsUrl(this.config.jev.baseUrl);
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (apiKey !== undefined) {
      headers.authorization = `Bearer ${apiKey}`;
      headers["x-litellm-api-key"] = apiKey;
      headers["x-api-key"] = apiKey;
    }
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.config.jev.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a scoring function. Output only the required JSON object.",
            },
            { role: "user", content: buildPrompt(state, questions) },
          ],
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new JevTransportError(
          `HTTP ${response.status}: ${text.slice(0, 200)}`,
        );
      }
      let payload: unknown = text;
      try {
        payload = JSON.parse(text);
      } catch {
        // body may already be answers JSON
      }
      const content =
        typeof payload === "object" && payload !== null && "choices" in payload
          ? messageContent(payload)
          : text;
      return parseChatAnswers(content || text, questions);
    } catch (error: unknown) {
      if (error instanceof JevTransportError) throw error;
      if (error instanceof JevInvalidResponseError) throw error;
      if (
        error instanceof Error &&
        /timed out|aborted|cancelled/i.test(error.message)
      ) {
        throw new JevTransportError(error.message);
      }
      throw new JevTransportError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async attemptChoice(
    state: JevState,
    questions: readonly JevQuestion[],
    signal: AbortSignal | undefined,
  ): Promise<JevAnswers> {
    const out: JevAnswers = new Map();
    for (const question of questions) {
      const apiKey = this.apiKey();
      const controller = withTimeout(signal, this.config.jev.timeoutMs);
      const endpoint = chatCompletionsUrl(this.config.jev.baseUrl);
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (apiKey !== undefined) {
        headers.authorization = `Bearer ${apiKey}`;
        headers["x-litellm-api-key"] = apiKey;
        headers["x-api-key"] = apiKey;
      }
      const user = [
        "Answer yes or no to the following question about a coding-agent context.",
        `context: ${state.context}`,
        `goal: ${state.goal}`,
        "history:",
        state.history.map((e) => `- ${e.label}: ${e.text}`).join("\n") ||
          "(empty)",
        "",
        `question (${question.name}): ${question.instructions}`,
      ].join("\n");
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.config.jev.model,
          messages: [{ role: "user", content: user }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "choice",
              schema: {
                type: "object",
                properties: { answer: { enum: ["yes", "no"] } },
                required: ["answer"],
              },
            },
          },
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new JevTransportError(
          `HTTP ${response.status}: ${text.slice(0, 200)}`,
        );
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (error: unknown) {
        throw new JevInvalidResponseError(
          `choice response JSON parse failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const root = payload as Record<string, unknown>;
      const thisThat = root.this_that as
        | { probabilities?: { yes?: number; no?: number }; choice?: string }
        | undefined;
      let noul: number | undefined = thisThat?.probabilities?.yes;
      if (typeof noul !== "number") {
        const content = messageContent(payload);
        try {
          const parsed = JSON.parse(content) as { answer?: string };
          if (parsed.answer === "yes") noul = 1;
          else if (parsed.answer === "no") noul = 0;
        } catch {
          // fall through
        }
      }
      if (typeof noul !== "number" || !Number.isFinite(noul)) {
        throw new JevInvalidResponseError(
          `choice model missing probability for ${question.name}`,
        );
      }
      out.set(question.name, Math.min(1, Math.max(0, noul)));
    }
    return out;
  }

  async score(
    state: JevState,
    questions: readonly JevQuestion[],
    signal: AbortSignal | undefined,
  ): Promise<JevAnswers> {
    const run = () =>
      this.useChoiceProtocol()
        ? this.attemptChoice(state, questions, signal)
        : this.attempt(state, questions, signal);
    try {
      return await run();
    } catch (error: unknown) {
      const retryable =
        error instanceof JevTransportError &&
        /\b5\d\d\b|network|fetch failed|ECONN|timed out/i.test(error.message);
      if (!retryable || this.config.jev.retries < 1) throw error;
      await delay(200, signal);
      return run();
    }
  }
}
