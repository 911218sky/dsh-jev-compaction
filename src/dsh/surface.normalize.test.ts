/**
 * DSH 0.1.7 flat ToolResultMessage and legacy nested v3 shapes must both parse.
 */
import { describe, expect, it } from "vitest";
import { normalizeToolResultMessage } from "./surface.js";

describe("normalizeToolResultMessage", () => {
  it("reads DSH 0.1.7 flat tool/result messages", () => {
    const normalized = normalizeToolResultMessage({
      role: "tool",
      id: "msg_1",
      source: { kind: "tool", callId: "call_abc" },
      toolCallId: "call_abc",
      isError: false,
      content: [{ type: "text", text: "hello from v4" }],
    });
    expect(normalized).toEqual({
      callId: "call_abc",
      isError: false,
      textOnly: true,
      text: "hello from v4",
      flat: true,
    });
  });

  it("reads legacy nested tool-result content blocks", () => {
    const normalized = normalizeToolResultMessage({
      role: "tool",
      id: "msg_2",
      source: { kind: "tool", callId: "call_legacy" },
      content: [
        {
          type: "tool-result",
          toolCallId: "call_legacy",
          isError: true,
          content: [{ type: "text", text: "boom" }],
        },
      ],
    });
    expect(normalized).toEqual({
      callId: "call_legacy",
      isError: true,
      textOnly: true,
      text: "boom",
      flat: false,
    });
  });

  it("rejects flat messages when toolCallId disagrees with source.callId", () => {
    expect(
      normalizeToolResultMessage({
        source: { callId: "call_a" },
        toolCallId: "call_b",
        content: [{ type: "text", text: "x" }],
      }),
    ).toBeUndefined();
  });

  it("rejects nested messages that the old reader would also drop", () => {
    expect(
      normalizeToolResultMessage({
        source: { callId: "call_a" },
        content: [{ type: "text", text: "looks flat but missing toolCallId" }],
      }),
    ).toBeUndefined();
  });
});
