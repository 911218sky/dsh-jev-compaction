/**
 * Structured plugin events (SPEC §27).
 *
 * Keeps `@yadsh/dsh-plugin-log` for fail-open file logs under `$DSH_HOME/logs`,
 * redaction, and structured event codes. When a Cordis host logger is available,
 * mirrors console output through it via `createHostLoggerSink` (the documented
 * DSH integration path). `diagnostics.logLevel` is applied on configure / reapply.
 */

import {
  createHostLoggerSink,
  getPluginLogger,
  isPluginLogLevel,
  type HostLoggerLike,
  type PluginLogLevel,
  type PluginLogger,
} from "@yadsh/dsh-plugin-log";

const PLUGIN_ID = "dsh-jev-compaction";

let logger: PluginLogger | undefined;

function createLogger(options?: {
  readonly host?: HostLoggerLike;
  readonly level?: PluginLogLevel;
}): PluginLogger {
  return getPluginLogger({
    pluginId: PLUGIN_ID,
    ...(options?.host !== undefined
      ? { consoleSink: createHostLoggerSink(options.host) }
      : {}),
    ...(options?.level !== undefined ? { level: options.level } : {}),
  });
}

function getLogger(): PluginLogger {
  if (logger === undefined) logger = createLogger();
  return logger;
}

/**
 * Bind the host Cordis logger as the console mirror and optionally set level.
 * Must run before other logging in the service constructor so the first
 * `getPluginLogger` cache entry includes the host sink.
 */
export function configureJevLogger(options?: {
  readonly host?: HostLoggerLike;
  readonly level?: string;
}): PluginLogger {
  const level =
    options?.level !== undefined && isPluginLogLevel(options.level)
      ? options.level
      : undefined;
  if (logger === undefined) {
    logger = createLogger({
      ...(options?.host !== undefined ? { host: options.host } : {}),
      ...(level !== undefined ? { level } : {}),
    });
    return logger;
  }
  if (level !== undefined) logger.setLevel(level);
  return logger;
}

/** Apply `diagnostics.logLevel` after a settings re-resolve. */
export function applyJevLogLevel(level: string): void {
  if (!isPluginLogLevel(level)) return;
  getLogger().setLevel(level);
}

/** Structured logger facade (lazy; prefer {@link configureJevLogger} first). */
export const jevLogger: PluginLogger = {
  get level() {
    return getLogger().level;
  },
  get format() {
    return getLogger().format;
  },
  trace(event, fields) {
    getLogger().trace(event, fields);
  },
  debug(event, fields) {
    getLogger().debug(event, fields);
  },
  info(event, fields) {
    getLogger().info(event, fields);
  },
  warn(event, fields) {
    getLogger().warn(event, fields);
  },
  error(event, fields) {
    getLogger().error(event, fields);
  },
  fatal(event, fields) {
    getLogger().fatal(event, fields);
  },
  child(module) {
    return getLogger().child(module);
  },
  setLevel(level) {
    getLogger().setLevel(level);
  },
  setFormat(format) {
    getLogger().setFormat(format);
  },
  flush() {
    getLogger().flush();
  },
  close() {
    return getLogger().close();
  },
};

/** Structured event names emitted by this plugin. */
export const JEV_EVENTS = {
  check: "jev-compaction/check",
  skip: "jev-compaction/skip",
  request: "jev-compaction/request",
  plan: "jev-compaction/plan",
  applied: "jev-compaction/applied",
  fallback: "jev-compaction/fallback",
  error: "jev-compaction/error",
  /**
   * The configured backend names an API key variable that is not set. Logged
   * once per backend at startup and on every settings change: the environment
   * is not part of the config, so the resolver cannot catch it — without this
   * line the first sign is a refused prune minutes later.
   */
  credentialMissing: "jev-compaction/credential-missing",
  queued: "jev-compaction/queued",
  /** Immediate result shaping at `tools/post-execute`. */
  shapingSkip: "jev-compaction/result-shaping-skip",
  shapingApplied: "jev-compaction/result-shaping-applied",
  shapingArchiveRoot: "jev-compaction/result-shaping-archive-root",
  shapingArchiveGc: "jev-compaction/result-shaping-archive-gc",
} as const;
