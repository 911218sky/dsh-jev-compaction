import { describe, expect, it } from "vitest";

import {
  ARCHIVE_ENTRY_LIMIT_HINT,
  decisionBackendDiag,
} from "../client/decision-diag.ts";
import { decisionFailureSkip } from "../service.ts";

describe("decisionBackendDiag", () => {
  it("warns when a named provider has empty apiKeyEnv", () => {
    const diag = decisionBackendDiag("openai", "", true);
    expect(diag.severity).toBe("warn");
    expect(diag.message).toMatch(/jev-failed/);
  });

  it("allows empty apiKeyEnv for custom providers", () => {
    const diag = decisionBackendDiag("custom", "  ", true);
    expect(diag.severity).toBe("ok");
    expect(diag.message).toMatch(/keyless/);
  });

  it("is ok when disabled", () => {
    expect(decisionBackendDiag("openai", "", false).severity).toBe("ok");
  });

  it("mentions the env var when configured", () => {
    const diag = decisionBackendDiag("typesafe", "TYPESAFE_API_KEY", true);
    expect(diag.severity).toBe("ok");
    expect(diag.message).toContain("TYPESAFE_API_KEY");
  });
});

describe("decisionFailureSkip", () => {
  it("maps Error to jev-failed fail-open fields", () => {
    expect(decisionFailureSkip(new Error("boom"))).toEqual({
      skipped: "jev-failed",
      error: "boom",
    });
  });

  it("stringifies non-Error throws", () => {
    expect(decisionFailureSkip("down")).toEqual({
      skipped: "jev-failed",
      error: "down",
    });
  });
});

describe("archive hints", () => {
  it("documents the 64 MiB entry cap", () => {
    expect(ARCHIVE_ENTRY_LIMIT_HINT).toMatch(/64 MiB/);
  });
});
