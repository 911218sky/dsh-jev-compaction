/**
 * Operator-facing decision-backend readiness copy for the settings card.
 * Host credential presence cannot be checked from the browser — only config shape.
 */

export type DecisionProvider = "openai" | "typesafe" | "jeff" | "custom" | string

export interface DecisionBackendDiag {
  readonly severity: "ok" | "warn"
  readonly message: string
}

/**
 * Describe whether the configured decision backend looks usable from settings alone.
 * Empty `apiKeyEnv` is intentional for keyless custom backends; for named providers
 * it usually means every prune will fail-open with `jev-failed`.
 */
export function decisionBackendDiag(
  provider: DecisionProvider,
  apiKeyEnv: string,
  enabled: boolean,
): DecisionBackendDiag {
  if (!enabled) {
    return {
      severity: "ok",
      message: "Plugin disabled — semantic pruning will not run.",
    }
  }
  const envName = apiKeyEnv.trim()
  if (envName.length === 0) {
    if (provider === "custom") {
      return {
        severity: "ok",
        message:
          "Custom provider with empty API key env — keyless local backends are OK. "
          + "If the endpoint needs a key, set apiKeyEnv or prune will fail-open (jev-failed).",
      }
    }
    return {
      severity: "warn",
      message:
        `Provider "${provider}" has no apiKeyEnv. Every Jev decision will fail with `
        + '"not configured" and pruning will skip fail-open (jev-failed) until the variable name is set.',
    }
  }
  return {
    severity: "ok",
    message:
      `Host reads process.env.${envName} for provider "${provider}". `
      + "If that variable is missing or the network fails, pruning skips fail-open (jev-failed) "
      + "and chat continues. Check /jev-compact reports for skip reasons.",
  }
}

/** Static archive limit note shown beside settings (not tunable). */
export const ARCHIVE_ENTRY_LIMIT_HINT =
  "Each archived original is capped at 64 MiB; larger tool dumps are not archived and follow the onFailure policy."
