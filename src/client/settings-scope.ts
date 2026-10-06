/**
 * Flat settings shape for SettingsFormModel. Nested Host config is adapted
 * through config-form-adapter.ts before the form reads or writes it.
 */

/** Flat field names the card stages and saves. */
export const FLAT_FIELD_NAMES = [
  "enabled",
  "resultShapingEnabled",
  "includeTools",
  "excludeTools",
  "thresholdChars",
  "maxPerTurn",
  "preserveErrors",
  "minSavingsRatio",
  "minSavingsChars",
  "archiveEnabled",
  "retentionDays",
  "archiveMaxBytes",
  "onFailure",
  "rootPath",
  "contextRatio",
  "minSurfaceTokens",
  "recentMessages",
  "recentTokens",
  "fullThreshold",
  "truncateThreshold",
  "provider",
  "baseUrl",
  "model",
  "apiKeyEnv",
  "timeoutMs",
  "maxConcurrency",
  "maxStateTokens",
  "keepHeadLines",
  "keepTailLines",
  "minClassificationConfidence",
  "logLevel",
] as const;

export type FlatFieldName = (typeof FLAT_FIELD_NAMES)[number];

/** Values SettingsFormModel reads from the adapted scope. */
export interface FlatJevSettings {
  readonly enabled?: boolean;
  readonly resultShapingEnabled?: boolean;
  readonly includeTools?: readonly string[];
  readonly excludeTools?: readonly string[];
  readonly thresholdChars?: number;
  readonly maxPerTurn?: number;
  readonly preserveErrors?: boolean;
  readonly minSavingsRatio?: number;
  readonly minSavingsChars?: number;
  readonly archiveEnabled?: boolean;
  readonly retentionDays?: number;
  readonly archiveMaxBytes?: number;
  readonly onFailure?: string;
  readonly rootPath?: string;
  readonly contextRatio?: number;
  readonly minSurfaceTokens?: number;
  readonly recentMessages?: number;
  readonly recentTokens?: number;
  readonly fullThreshold?: number;
  readonly truncateThreshold?: number;
  readonly provider?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly apiKeyEnv?: string;
  readonly timeoutMs?: number;
  readonly maxConcurrency?: number;
  readonly maxStateTokens?: number;
  readonly keepHeadLines?: number;
  readonly keepTailLines?: number;
  readonly minClassificationConfidence?: number;
  readonly logLevel?: string;
}
