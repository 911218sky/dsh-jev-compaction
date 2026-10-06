import { describe, expect, it } from "vitest";

import { readLiveJevConfig, type SettingsInstallFace } from "./install.ts";

describe("readLiveJevConfig", () => {
  it("returns the SettingsForms document for the cordis entry id", () => {
    const settings: SettingsInstallFace = {
      describe: () => [
        { ns: "other", value: { enabled: false } },
        { ns: "dsh-jev-compaction", value: { enabled: true, jev: { model: "m" } } },
      ],
    };
    expect(readLiveJevConfig(settings, { enabled: false })).toEqual({
      enabled: true,
      jev: { model: "m" },
    });
  });

  it("falls back to composition when describe is missing", () => {
    const fallback = { enabled: true, trigger: { contextRatio: 0.9 } };
    expect(readLiveJevConfig(undefined, fallback)).toBe(fallback);
    expect(readLiveJevConfig({}, fallback)).toBe(fallback);
  });

  it("falls back when the entry is absent or non-object", () => {
    const fallback = { enabled: false };
    expect(
      readLiveJevConfig(
        { describe: () => [{ ns: "dsh-jev-compaction", value: "bad" }] },
        fallback,
      ),
    ).toBe(fallback);
    expect(
      readLiveJevConfig(
        { describe: () => [{ ns: "dsh-jev-compaction" }] },
        fallback,
      ),
    ).toBe(fallback);
  });
});
