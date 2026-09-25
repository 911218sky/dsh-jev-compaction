/**
 * DSH surface mechanics, isolated behind this compat layer (SPEC §24).
 *
 * Reads the current surface, indexes tool calls, validates snapshot
 * freshness, and constructs legal single-node `tool/result` replacements.
 * Every DSH-version-specific field name lives here; callers pass normalized
 * data in and get normalized data out.
 *
 * DSH ≤0.1.6 used a nested `tool-result` content block. DSH 0.1.7+ flattens
 * `ToolResultMessage` (`toolCallId` / `isError` on the message; `content` is
 * plain text/image blocks). Both shapes are accepted here.
 */

import { freezeMessage } from "@deepseek-ai/dsh-llm";
import type { ContentBlock, ToolResultMessage } from "@deepseek-ai/dsh-llm";
import type {
  Session,
  SessionEvent,
  SessionSeq,
  ToolResultMessage as SessionToolResultMessage,
} from "@deepseek-ai/dsh-session";
import type { SessionEventType } from "@deepseek-ai/dsh-session/types";

/** One logged event, generically typed for read-only scanning. */
export type AnySessionEvent = SessionEvent<SessionEventType>;

/** Indexed `tool/call` metadata for one session log. */
export interface ToolCallInfo {
  readonly seq: SessionSeq;
  readonly callId: string;
  readonly name: string;
  readonly arguments: string;
  readonly turn: number;
  readonly step: number;
}

/** Identity of the surface at planning time, for staleness detection. */
export interface SurfaceSnapshot {
  readonly replaceGeneration: number;
  readonly nodes: readonly SessionSeq[];
}

/** Normalized view of one tool/result message (v3 nested or v4 flat). */
export interface NormalizedToolResult {
  readonly callId: string;
  readonly isError: boolean;
  readonly textOnly: boolean;
  readonly text: string;
  /** True when the message uses the DSH 0.1.7 flat ToolResultMessage shape. */
  readonly flat: boolean;
}

type TextBlock = { type: string; text?: string };

type NestedToolResultBlock = {
  type?: string;
  toolCallId: string;
  isError?: boolean;
  content: TextBlock[];
};

type ToolResultMessageLike = {
  source?: { callId?: string };
  toolCallId?: string;
  isError?: boolean;
  content?: unknown[];
};

function isTextOnly(blocks: readonly TextBlock[]): boolean {
  return blocks.length > 0 && blocks.every((block) => block.type === "text");
}

function joinText(blocks: readonly TextBlock[]): string {
  return blocks
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

/**
 * Normalize a tool/result message from either DSH shape.
 * Returns undefined when the payload is incomplete or call ids disagree.
 */
export function normalizeToolResultMessage(
  message: unknown,
): NormalizedToolResult | undefined {
  if (message === null || typeof message !== "object") return undefined;
  const msg = message as ToolResultMessageLike;
  const sourceCallId = msg.source?.callId;
  if (typeof sourceCallId !== "string" || sourceCallId.length === 0)
    return undefined;
  if (!Array.isArray(msg.content) || msg.content.length === 0) return undefined;

  // DSH 0.1.7+ flat ToolResultMessage.
  if (typeof msg.toolCallId === "string") {
    if (msg.toolCallId !== sourceCallId) return undefined;
    const blocks = msg.content as TextBlock[];
    if (!blocks.every((block) => typeof block?.type === "string"))
      return undefined;
    return {
      callId: sourceCallId,
      isError: msg.isError === true,
      textOnly: isTextOnly(blocks),
      text: joinText(blocks),
      flat: true,
    };
  }

  // Legacy nested tool-result content block (≤0.1.6 / v3 logs).
  const block = msg.content[0] as NestedToolResultBlock | undefined;
  if (
    block === undefined ||
    typeof block.toolCallId !== "string" ||
    block.toolCallId !== sourceCallId ||
    !Array.isArray(block.content)
  ) {
    return undefined;
  }
  return {
    callId: sourceCallId,
    isError: block.isError === true,
    textOnly: isTextOnly(block.content),
    text: joinText(block.content),
    flat: false,
  };
}

/** Read the ordered current surface events (one pass, no rescans). */
export function readSurfaceEvents(session: Session): AnySessionEvent[] {
  const events: AnySessionEvent[] = [];
  for (const seq of session.surface.nodes) {
    const event = session.eventAt(seq);
    if (event !== undefined) events.push(event);
  }
  return events;
}

/** Index every `tool/call` in the log by callId (one pass over the log). */
export function buildCallIndex(session: Session): Map<string, ToolCallInfo> {
  const index = new Map<string, ToolCallInfo>();
  for (const event of session.snapshotEvents()) {
    if (event.type !== "tool/call") continue;
    const data = event.data as {
      callId: string;
      name: string;
      arguments: string;
      turn: number;
      step: number;
    };
    index.set(data.callId, {
      seq: event.seq,
      callId: data.callId,
      name: data.name,
      arguments: data.arguments,
      turn: data.turn,
      step: data.step,
    });
  }
  return index;
}

/** True when the result carries only text blocks (v1 mutation domain). */
export function hasOnlyTextBlocks(event: SessionEvent<"tool/result">): boolean {
  const normalized = normalizeToolResultMessage(event.data.message);
  return normalized?.textOnly === true;
}

/** Joined text of the result's text blocks, separated by newlines. */
export function extractResultText(event: SessionEvent<"tool/result">): string {
  return normalizeToolResultMessage(event.data.message)?.text ?? "";
}

/** Capture the surface identity used to detect drift across async work. */
export function captureSurfaceSnapshot(session: Session): SurfaceSnapshot {
  return {
    replaceGeneration: session.surface.replaceGeneration,
    nodes: [...session.surface.nodes],
  };
}

/**
 * Revalidate a snapshot right before mutation: the generation must be
 * unchanged and every planned seq must still be a current `tool/result`
 * surface node with text-only blocks.
 */
export function isSnapshotFresh(
  session: Session,
  snapshot: SurfaceSnapshot,
  plannedSeqs: readonly number[],
): boolean {
  if (session.surface.replaceGeneration !== snapshot.replaceGeneration)
    return false;
  const nodes = session.surface.nodes;
  for (const seq of plannedSeqs) {
    if (!nodes.some((node) => node === (seq as SessionSeq))) return false;
    const event = session.eventAt(seq as SessionSeq);
    if (event === undefined || event.type !== "tool/result") return false;
    if (!hasOnlyTextBlocks(event)) return false;
  }
  return true;
}

/**
 * Append one replay-safe replacement for a single `tool/result` node. The
 * caller must have validated `isSnapshotFresh` immediately before. Only the
 * textual content changes; every other field of the original event data is
 * carried over verbatim.
 *
 * @returns the replacement event's seq.
 */
export function appendToolResultReplacement(
  session: Session,
  original: SessionEvent<"tool/result">,
  replacementText: string,
): SessionSeq {
  const normalized = normalizeToolResultMessage(original.data.message);
  if (normalized === undefined) {
    throw new Error("tool/result message shape is not replaceable");
  }
  const content: ContentBlock[] = [{ type: "text", text: replacementText }];

  let message: SessionToolResultMessage;
  if (normalized.flat) {
    message = freezeMessage<SessionToolResultMessage>({
      ...original.data.message,
      content,
    } as ToolResultMessage);
  } else {
    const result = original.data.message.content[0] as NestedToolResultBlock;
    message = freezeMessage<SessionToolResultMessage>({
      ...original.data.message,
      content: [
        {
          ...result,
          content,
        },
      ],
    } as ToolResultMessage);
  }

  const replacement = session.append(
    "tool/result",
    {
      ...original.data,
      message,
    },
    {
      surfaceOp: {
        op: "replace",
        startSeq: original.seq,
        endSeq: original.seq,
      },
      sourceEventSeqs: [original.seq],
    },
  );
  return replacement.seq;
}
