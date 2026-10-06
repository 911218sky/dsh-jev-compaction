/**
 * Present nested plugin Config as a flat SettingsFormScope for DSH's
 * SettingsFormModel (which mutates with path: [field] only).
 */

import type { JevCompactionConfig } from "../config.js";
import type { FlatFieldName, FlatJevSettings } from "./settings-scope.js";

/** Minimal ConfigForm surface from dsh-client-ui-settings. */
export interface ConfigFormLike<T> {
  getSnapshot(): {
    status: "loading" | "ready" | "unavailable";
    value: T | undefined;
    base: unknown;
    user: unknown;
    revision: number | undefined;
    writable: boolean;
    mode: "host" | "memory";
  };
  subscribe(listener: () => void): () => void;
  mutate(
    ops: ReadonlyArray<{ op: "set" | "unset"; path: string[]; value?: unknown }>,
    expectedRevision?: number,
  ): Promise<boolean>;
}

/** SettingsFormScope-shaped face SettingsFormModel expects. */
export interface FlatSettingsFormScope {
  getSnapshot(): {
    status: "loading" | "ready" | "unavailable";
    value: FlatJevSettings | undefined;
    base: unknown;
    user: unknown;
    revision: number | undefined;
    writable: boolean;
  };
  subscribe(listener: () => void): () => void;
  mutate(
    ops: ReadonlyArray<{
      op: "set" | "unset";
      path: readonly string[];
      value?: unknown;
    }>,
    expectedRevision?: number,
  ): Promise<boolean>;
}

const NESTED_PATH: Record<FlatFieldName, readonly string[]> = {
  enabled: ["enabled"],
  resultShapingEnabled: ["resultShaping", "enabled"],
  includeTools: ["resultShaping", "includeTools"],
  excludeTools: ["resultShaping", "excludeTools"],
  thresholdChars: ["resultShaping", "thresholdChars"],
  maxPerTurn: ["resultShaping", "maxPerTurn"],
  preserveErrors: ["resultShaping", "preserveErrors"],
  minSavingsRatio: ["resultShaping", "minSavingsRatio"],
  minSavingsChars: ["resultShaping", "minSavingsChars"],
  archiveEnabled: ["archive", "enabled"],
  retentionDays: ["archive", "retentionDays"],
  archiveMaxBytes: ["archive", "maxBytes"],
  onFailure: ["archive", "onFailure"],
  rootPath: ["archive", "rootPath"],
  contextRatio: ["trigger", "contextRatio"],
  minSurfaceTokens: ["trigger", "minSurfaceTokens"],
  recentMessages: ["preserve", "recentMessages"],
  recentTokens: ["preserve", "recentTokens"],
  fullThreshold: ["decisions", "fullThreshold"],
  truncateThreshold: ["decisions", "truncateThreshold"],
  provider: ["decision", "provider"],
  baseUrl: ["jev", "baseUrl"],
  model: ["jev", "model"],
  apiKeyEnv: ["jev", "apiKeyEnv"],
  timeoutMs: ["jev", "timeoutMs"],
  maxConcurrency: ["jev", "maxConcurrency"],
  maxStateTokens: ["state", "maxStateTokens"],
  keepHeadLines: ["resultShaping", "keepHeadLines"],
  keepTailLines: ["resultShaping", "keepTailLines"],
  minClassificationConfidence: [
    "resultShaping",
    "minClassificationConfidence",
  ],
  logLevel: ["diagnostics", "logLevel"],
};

function flatten(value: JevCompactionConfig | undefined): FlatJevSettings | undefined {
  if (value === undefined) return undefined;
  return {
    enabled: value.enabled,
    resultShapingEnabled: value.resultShaping?.enabled,
    includeTools: value.resultShaping?.includeTools,
    excludeTools: value.resultShaping?.excludeTools,
    thresholdChars: value.resultShaping?.thresholdChars,
    maxPerTurn: value.resultShaping?.maxPerTurn,
    preserveErrors: value.resultShaping?.preserveErrors,
    minSavingsRatio: value.resultShaping?.minSavingsRatio,
    minSavingsChars: value.resultShaping?.minSavingsChars,
    archiveEnabled: value.archive?.enabled,
    retentionDays: value.archive?.retentionDays,
    archiveMaxBytes: value.archive?.maxBytes,
    onFailure: value.archive?.onFailure,
    rootPath: value.archive?.rootPath,
    contextRatio: value.trigger?.contextRatio,
    minSurfaceTokens: value.trigger?.minSurfaceTokens,
    recentMessages: value.preserve?.recentMessages,
    recentTokens: value.preserve?.recentTokens,
    fullThreshold: value.decisions?.fullThreshold,
    truncateThreshold: value.decisions?.truncateThreshold,
    provider: value.decision?.provider,
    baseUrl: value.jev?.baseUrl,
    model: value.jev?.model,
    apiKeyEnv: value.jev?.apiKeyEnv,
    timeoutMs: value.jev?.timeoutMs,
    maxConcurrency: value.jev?.maxConcurrency,
    maxStateTokens: value.state?.maxStateTokens,
    keepHeadLines: value.resultShaping?.keepHeadLines,
    keepTailLines: value.resultShaping?.keepTailLines,
    minClassificationConfidence:
      value.resultShaping?.minClassificationConfidence,
    logLevel: value.diagnostics?.logLevel,
  };
}

function flattenLayer(layer: unknown): unknown {
  if (layer === undefined || layer === null || typeof layer !== "object") {
    return layer;
  }
  return flattenUserLayer(layer as Record<string, unknown>);
}

/** Flatten nested user/base layers so override badges match nested paths. */
function flattenUserLayer(user: Record<string, unknown>): FlatJevSettings {
  const flat: Record<string, unknown> = {};
  for (const [field, path] of Object.entries(NESTED_PATH) as Array<
    [FlatFieldName, readonly string[]]
  >) {
    let cursor: unknown = user;
    for (const segment of path) {
      if (
        cursor === null ||
        typeof cursor !== "object" ||
        !Object.hasOwn(cursor as object, segment)
      ) {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    if (cursor !== undefined) flat[field] = cursor;
  }
  return flat as FlatJevSettings;
}

function nestedPath(field: string): readonly string[] {
  if (field in NESTED_PATH) {
    return NESTED_PATH[field as FlatFieldName];
  }
  return [field];
}

/** Adapt ConfigForm&lt;nested Config&gt; into the flat scope SettingsFormModel uses. */
export function flatSettingsFormScope(
  form: ConfigFormLike<JevCompactionConfig>,
): FlatSettingsFormScope {
  return {
    getSnapshot() {
      const snap = form.getSnapshot();
      return {
        status: snap.status,
        value: flatten(snap.value),
        base: flattenLayer(snap.base),
        user: flattenLayer(snap.user),
        revision: snap.revision,
        writable: snap.writable,
      };
    },
    subscribe(listener) {
      return form.subscribe(listener);
    },
    mutate(ops, expectedRevision) {
      const nested = ops.map((op) => {
        const field = op.path[0];
        const path =
          typeof field === "string" ? nestedPath(field) : [...op.path];
        return op.op === "set"
          ? { op: "set" as const, path, value: op.value }
          : { op: "unset" as const, path };
      });
      return form.mutate(nested, expectedRevision);
    },
  };
}
