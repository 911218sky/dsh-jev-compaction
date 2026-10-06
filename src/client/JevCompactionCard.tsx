/**
 * Jev Compaction settings card using DSH SettingsForm / SettingsValueField /
 * Checkbox / ConfigField — same chrome as official settings plugins.
 */

import {
  Checkbox,
  ConfigField,
  SettingsForm,
  SettingsValueField,
  type SettingsFieldState,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  InjectFace,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { ReactElement, ReactNode } from "react";

import type {} from "./slots.js";
import type {
  JevCompactionCardFace,
  JevCompactionCardState,
} from "./jev-card-controller.js";
import { formatBytes, triggerSummary } from "./format.js";
import type { FlatFieldName } from "./settings-scope.js";
import {
  ARCHIVE_ENTRY_LIMIT_HINT,
  decisionBackendDiag,
} from "./decision-diag.js";

export const CARD_DESCRIPTION =
  "Semantic result shaping and historical context compaction powered by Jev.";

/** Display fallbacks only — keep Schemastery out of the browser bundle. */
const DISPLAY_DEFAULTS = {
  enabled: true,
  resultShapingEnabled: false,
  archiveEnabled: true,
  provider: "openai",
  model: "gpt-4o-mini",
  thresholdChars: 12000,
  minLines: 80,
  preserveErrors: true,
  archiveMaxBytes: 1_073_741_824,
} as const;

export type JevCompactionCardProps = PropsRuntime<"settings.plugin.item"> &
  InjectFace<JevCompactionCardFace>;

const FORM_LABELS = {
  unavailable: "This plugin is not loaded, so it cannot be configured right now.",
  readOnly: "This deployment stores settings read-only.",
  saveFailed:
    "The deployment did not accept these values; they were left for you to correct.",
  save: "Save",
  saving: "Saving…",
};

const FIELD_LABELS = {
  overridden: "Overridden",
  reset: "Reset to default",
  invalidNumber: "Enter a valid number, or leave blank to use the default.",
  invalidRatio: "Enter a number between 0 and 1, or leave blank for the default.",
  invalidPercent:
    "Enter a whole number between 0 and 100, or leave blank for the default.",
  invalidEnum: "Choose one of the listed values, or reset to the default.",
};

function boolFromField(field: SettingsFieldState, fallback: boolean): boolean {
  if (field.text === "true") return true;
  if (field.text === "false") return false;
  return fallback;
}

function numberFromField(field: SettingsFieldState, fallback: number): number {
  const parsed = Number(field.text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Section(props: { title: string; children: ReactNode }): ReactElement {
  return (
    <section>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function Hint(props: { children: ReactNode }): ReactElement {
  return <p>{props.children}</p>;
}

function Warning(props: { children: ReactNode }): ReactElement {
  return <p role="status">{props.children}</p>;
}

function valueField(
  field: FlatFieldName,
  state: JevCompactionCardState,
  props: JevCompactionCardProps,
  options: {
    label: string;
    hint?: string;
    invalidLabel?: string;
    numeric?: boolean;
    placeholder?: string;
  },
) {
  return (
    <SettingsValueField
      key={field}
      id={`jev-compaction-${field}`}
      label={options.label}
      hint={options.hint}
      overriddenLabel={FIELD_LABELS.overridden}
      resetLabel={FIELD_LABELS.reset}
      invalidLabel={options.invalidLabel ?? FIELD_LABELS.invalidNumber}
      numeric={options.numeric}
      placeholder={options.placeholder}
      disabled={!state.writable}
      {...state[field]}
      onEdit={(text) => props.edit(field, text)}
      onReset={() => props.resetField(field)}
    />
  );
}

function selectField(
  field: FlatFieldName,
  state: JevCompactionCardState,
  props: JevCompactionCardProps,
  options: {
    label: string;
    hint?: string;
    choices: readonly string[];
  },
) {
  return (
    <ConfigField
      key={field}
      label={options.label}
      value={state[field].text}
      secret={false}
      choices={options.choices}
      disabled={!state.writable}
      overridden={state[field].overridden}
      invalid={state[field].invalid}
      labels={{
        reset: FIELD_LABELS.reset,
        inherited: FIELD_LABELS.overridden,
        invalid: FIELD_LABELS.invalidEnum,
      }}
      onChange={(value) => props.edit(field, value)}
      onReset={() => props.resetField(field)}
    />
  );
}

/** Render the Jev Compaction settings card. */
export function JevCompactionCard(props: JevCompactionCardProps): ReactElement | null {
  const state = props.useJevCompactionCard((snapshot) => snapshot);

  if ("view" in props && (props as { view?: string }).view === "summary") {
    return CARD_DESCRIPTION;
  }
  if (!state.available) return null;

  const disabled = !state.writable;
  const enabled = boolFromField(state.enabled, DISPLAY_DEFAULTS.enabled);
  const shapingEnabled = boolFromField(
    state.resultShapingEnabled,
    DISPLAY_DEFAULTS.resultShapingEnabled,
  );
  const archiveEnabled = boolFromField(
    state.archiveEnabled,
    DISPLAY_DEFAULTS.archiveEnabled,
  );
  const provider = state.provider.text || DISPLAY_DEFAULTS.provider;
  const model = state.model.text || DISPLAY_DEFAULTS.model;
  const thresholdChars = numberFromField(
    state.thresholdChars,
    DISPLAY_DEFAULTS.thresholdChars,
  );
  const archiveMaxBytes = numberFromField(
    state.archiveMaxBytes,
    DISPLAY_DEFAULTS.archiveMaxBytes,
  );

  return (
    <SettingsForm
      labels={FORM_LABELS}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <Hint>{CARD_DESCRIPTION}</Hint>

      <Section title="General">
        <p>
          Status: {enabled ? "Enabled" : "Disabled"} · Provider: {provider} ·
          Model: {model}
        </p>
        <Checkbox
          label="Enable Jev Compaction"
          checked={enabled}
          disabled={disabled}
          onChange={(checked) =>
            props.edit("enabled", checked ? "true" : "false")
          }
        />
      </Section>

      <Section title="Immediate result shaping">
        <Hint>
          Semantically compress large repetitive tool outputs before they are
          written to conversation history. Runs on the tool-execution path, so
          the original rendered result is not recoverable from session replay
          unless the archive below is on.
        </Hint>
        <Checkbox
          label="Shape tool results before they are persisted"
          checked={shapingEnabled}
          disabled={disabled}
          onChange={(checked) =>
            props.edit("resultShapingEnabled", checked ? "true" : "false")
          }
        />
        {shapingEnabled && !archiveEnabled ? (
          <Warning>
            Shaped output may not be recoverable from session replay: the
            original-output archive is off.
          </Warning>
        ) : null}
        {valueField("includeTools", state, props, {
          label: "Eligible tools",
          hint: "One tool name per line. Only these tools may be shaped.",
          placeholder: "bash",
        })}
        {valueField("excludeTools", state, props, {
          label: "Never shape these tools",
          hint: "One tool name per line. Exclusions win over the eligible list.",
          placeholder: "add an excluded tool",
        })}
        {valueField("thresholdChars", state, props, {
          label: "Minimum result size (characters)",
          numeric: true,
        })}
        {valueField("maxPerTurn", state, props, {
          label: "Maximum shaped results per turn",
          numeric: true,
        })}
        <Checkbox
          label="Preserve errors"
          checked={boolFromField(
            state.preserveErrors,
            DISPLAY_DEFAULTS.preserveErrors,
          )}
          disabled={disabled}
          onChange={(checked) =>
            props.edit("preserveErrors", checked ? "true" : "false")
          }
        />
        {valueField("minSavingsRatio", state, props, {
          label: "Minimum savings ratio (0–1)",
          hint: "A shaping that saves less than this is discarded.",
          invalidLabel: FIELD_LABELS.invalidRatio,
          numeric: true,
        })}
        {valueField("minSavingsChars", state, props, {
          label: "Minimum savings (characters)",
          numeric: true,
        })}
        <Hint>
          Trigger:{" "}
          {triggerSummary(thresholdChars, DISPLAY_DEFAULTS.minLines)}.
        </Hint>
      </Section>

      <Section title="Original output archive">
        <Hint>
          Immediate shaping happens before DSH persists the final tool result.
          Archiving keeps a local copy of the original rendered output for
          diagnostics and future recovery.
        </Hint>
        <Checkbox
          label="Archive the original output"
          checked={archiveEnabled}
          disabled={disabled}
          onChange={(checked) =>
            props.edit("archiveEnabled", checked ? "true" : "false")
          }
        />
        {!archiveEnabled ? (
          <Warning>
            Shaped output may not be recoverable from session replay.
          </Warning>
        ) : null}
        {valueField("retentionDays", state, props, {
          label: "Retention (days; 0 = keep forever)",
          numeric: true,
        })}
        {valueField("archiveMaxBytes", state, props, {
          label: "Maximum archive size (bytes)",
          hint: `Currently ${formatBytes(archiveMaxBytes)}. 0 disables the size cap.`,
          numeric: true,
        })}
        {selectField("onFailure", state, props, {
          label: "If archiving fails",
          hint: "Fail-open by default: an unarchived result is never shaped.",
          choices: ["keep-original", "shape-anyway"],
        })}
        {valueField("rootPath", state, props, {
          label: "Archive root",
          hint: "Absolute path, or empty for the harness home. Changing it needs a restart.",
          placeholder: "default: $DSH_HOME/data/dsh-jev-compaction/originals",
        })}
        <Hint>{ARCHIVE_ENTRY_LIMIT_HINT}</Hint>
      </Section>

      <Section title="Historical compaction">
        <Hint>
          When context grows, semantically prune stale historical tool results
          before falling back to ordinary summary compaction.
        </Hint>
        {valueField("contextRatio", state, props, {
          label: "Start semantic pruning at (% of model context)",
          invalidLabel: FIELD_LABELS.invalidPercent,
          numeric: true,
        })}
        {valueField("minSurfaceTokens", state, props, {
          label: "Minimum surface tokens",
          numeric: true,
        })}
        {valueField("recentMessages", state, props, {
          label: "Preserve recent messages",
          numeric: true,
        })}
        {valueField("recentTokens", state, props, {
          label: "Preserve recent tokens",
          numeric: true,
        })}
        {valueField("fullThreshold", state, props, {
          label: "Full-keep threshold (0–1)",
          hint: "Above this retention score a result stays full.",
          invalidLabel: FIELD_LABELS.invalidRatio,
          numeric: true,
        })}
        {valueField("truncateThreshold", state, props, {
          label: "Truncate threshold (0–1)",
          hint: "Above this a result keeps a truncated head and tail instead of a stub.",
          invalidLabel: FIELD_LABELS.invalidRatio,
          numeric: true,
        })}
      </Section>

      <Section title="Decision backend">
        <Hint>
          Scoring backend for semantic retention. Use openai for any
          OpenAI-compatible chat API, or a System One endpoint.
        </Hint>
        {(() => {
          const provider = state.provider.text.trim() || DISPLAY_DEFAULTS.provider;
          const apiKeyEnv = state.apiKeyEnv.text;
          const diag = decisionBackendDiag(provider, apiKeyEnv, enabled);
          return diag.severity === "warn" ? (
            <Warning>{diag.message}</Warning>
          ) : (
            <Hint>{diag.message}</Hint>
          );
        })()}
        {selectField("provider", state, props, {
          label: "Provider",
          choices: ["openai", "typesafe", "jeff", "custom"],
        })}
        {valueField("baseUrl", state, props, {
          label: "Endpoint",
          placeholder: "https://api.openai.com/v1",
        })}
        {valueField("model", state, props, {
          label: "Model",
        })}
        {valueField("apiKeyEnv", state, props, {
          label: "API key environment variable",
          hint: "Only the variable name is stored and shown. The key itself is read on the Host and never reaches this page.",
          placeholder: "TYPESAFE_API_KEY",
        })}
      </Section>

      <details>
        <summary>Advanced</summary>
        {valueField("timeoutMs", state, props, {
          label: "Request timeout (ms)",
          numeric: true,
        })}
        {valueField("maxConcurrency", state, props, {
          label: "Concurrent Jev requests",
          numeric: true,
        })}
        {valueField("maxStateTokens", state, props, {
          label: "Jev state token ceiling",
          numeric: true,
        })}
        {valueField("keepHeadLines", state, props, {
          label: "Head lines kept per shaped result",
          numeric: true,
        })}
        {valueField("keepTailLines", state, props, {
          label: "Tail lines kept per shaped result",
          numeric: true,
        })}
        {valueField("minClassificationConfidence", state, props, {
          label: "Minimum classification confidence (0–1)",
          hint: "Below this the group is kept.",
          invalidLabel: FIELD_LABELS.invalidRatio,
          numeric: true,
        })}
        {selectField("logLevel", state, props, {
          label: "Log level",
          choices: ["silent", "error", "warn", "info", "debug", "trace"],
        })}
      </details>
    </SettingsForm>
  );
}
