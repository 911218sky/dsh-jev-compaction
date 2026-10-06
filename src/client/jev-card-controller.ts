/**
 * Settings card controller built on DSH SettingsFormModel — same pattern as
 * dsh-headroom and @deepseek-ai/dsh-client-ui-settings-shell.
 */

import {
  SettingsFormModel,
  settingsNumberField,
  settingsTextField,
  type SettingsFieldSpec,
  type SettingsFieldState,
  type SettingsFormShell,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";

import { JEV_COMPACTION_ENTRY_ID } from "../shared/settings.js";
import type { FlatSettingsFormScope } from "./config-form-adapter.js";
import {
  FLAT_FIELD_NAMES,
  type FlatFieldName,
  type FlatJevSettings,
} from "./settings-scope.js";

export { JEV_COMPACTION_ENTRY_ID };
function settingsBooleanField(field: string): SettingsFieldSpec {
  return {
    field,
    format: (value) =>
      value === true ? "true" : value === false ? "false" : "",
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      if (trimmed === "true") return { kind: "set", value: true };
      if (trimmed === "false") return { kind: "set", value: false };
      return undefined;
    },
  };
}

function settingsProbabilityField(field: string): SettingsFieldSpec {
  return {
    field,
    format: (value) => (typeof value === "number" ? String(value) : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return undefined;
      }
      return { kind: "set", value: parsed };
    },
  };
}

function settingsPercentField(field: string): SettingsFieldSpec {
  return {
    field,
    format: (value) =>
      typeof value === "number" ? String(Math.round(value * 100)) : "",
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return undefined;
      }
      return { kind: "set", value: parsed / 100 };
    },
  };
}

function settingsStringListField(field: string): SettingsFieldSpec {
  return {
    field,
    format: (value) =>
      Array.isArray(value)
        ? value
            .filter((entry): entry is string => typeof entry === "string")
            .join("\n")
        : "",
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const seen = new Set<string>();
      const values: string[] = [];
      for (const line of trimmed.split("\n")) {
        const entry = line.trim();
        if (entry.length === 0 || seen.has(entry)) continue;
        seen.add(entry);
        values.push(entry);
      }
      return { kind: "set", value: values };
    },
  };
}

function settingsEnumField(
  field: string,
  allowed: readonly string[],
): SettingsFieldSpec {
  return {
    field,
    format: (value) => (typeof value === "string" ? value : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      if (!allowed.includes(trimmed)) return undefined;
      return { kind: "set", value: trimmed };
    },
  };
}

const FIELD_SPECS: SettingsFieldSpec[] = [
  settingsBooleanField("enabled"),
  settingsBooleanField("resultShapingEnabled"),
  settingsStringListField("includeTools"),
  settingsStringListField("excludeTools"),
  settingsNumberField("thresholdChars"),
  settingsNumberField("maxPerTurn"),
  settingsBooleanField("preserveErrors"),
  settingsProbabilityField("minSavingsRatio"),
  settingsNumberField("minSavingsChars"),
  settingsBooleanField("archiveEnabled"),
  settingsNumberField("retentionDays"),
  settingsNumberField("archiveMaxBytes"),
  settingsEnumField("onFailure", ["keep-original", "shape-anyway"]),
  settingsTextField("rootPath"),
  settingsPercentField("contextRatio"),
  settingsNumberField("minSurfaceTokens"),
  settingsNumberField("recentMessages"),
  settingsNumberField("recentTokens"),
  settingsProbabilityField("fullThreshold"),
  settingsProbabilityField("truncateThreshold"),
  settingsEnumField("provider", ["openai", "typesafe", "jeff", "custom"]),
  settingsTextField("baseUrl"),
  settingsTextField("model"),
  settingsTextField("apiKeyEnv"),
  settingsNumberField("timeoutMs"),
  settingsNumberField("maxConcurrency"),
  settingsNumberField("maxStateTokens"),
  settingsNumberField("keepHeadLines"),
  settingsNumberField("keepTailLines"),
  settingsProbabilityField("minClassificationConfidence"),
  settingsEnumField("logLevel", [
    "silent",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ]),
];

export type JevCompactionCardState = SettingsFormShell &
  Record<FlatFieldName, SettingsFieldState>;

/** Slot inject face for the settings.plugin.item registration. */
export interface JevCompactionCardFace {
  hooks: {
    jevCompactionCard: SnapshotStore<JevCompactionCardState>;
  };
  edit: (field: string, text: string) => void;
  resetField: (field: string) => void;
  save: () => void;
  discard: () => void;
}

export class JevCompactionCardController {
  private readonly form: SettingsFormModel<FlatJevSettings>;
  private readonly store: SnapshotStore<JevCompactionCardState>;

  constructor(scope: FlatSettingsFormScope) {
    this.form = new SettingsFormModel(scope, FIELD_SPECS);
    this.store = this.form.bind(() => this.projection());
  }

  private projection(): JevCompactionCardState {
    const shell = this.form.shell();
    const fields = Object.fromEntries(
      FLAT_FIELD_NAMES.map((field) => [field, this.form.field(field)]),
    ) as Record<FlatFieldName, SettingsFieldState>;
    return { ...shell, ...fields };
  }

  inject(): JevCompactionCardFace {
    return {
      hooks: { jevCompactionCard: this.store },
      ...this.form.actions(),
    };
  }

  dispose(): void {
    this.form.dispose();
  }
}
