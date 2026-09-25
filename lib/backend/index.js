import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
import z from "@deepseek-ai/schemastery";
import { Service } from "@deepseek-ai/cordis";
import { freezeMessage } from "@deepseek-ai/dsh-llm";
import { getPluginLogger } from "@yadsh/dsh-plugin-log";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { createHash } from "node:crypto";
//#region src/config.ts
/**
* Configuration surface of the dsh-jev-compaction plugin.
*
* The Schemastery schema (`JevCompactionConfigSchema`) is the user-facing
* contract exposed through the Cordis `Config` convention on the service;
* `resolveJevCompactionConfig` normalizes raw config into fully defaulted,
* clamped values, so the planner and the Jev client never see optional
* fields or unsafe limits. Field semantics follow the plugin SPEC §22.
*/
/** Endpoint presets shipped with the plugin (SPEC §18, §26.3). */
const SYSTEM_ONE_PRESETS = {
	/** OpenAI-compatible chat/completions (any gateway: OpenAI, LiteLLM, vLLM, …). */
	openai: {
		baseUrl: "https://api.openai.com/v1",
		apiKeyEnv: "OPENAI_API_KEY",
		model: "gpt-4o-mini"
	},
	typesafe: {
		baseUrl: "https://api.typesafe.ai/v1/systemone",
		apiKeyEnv: "TYPESAFE_API_KEY",
		model: "jev-latest"
	},
	jeff: {
		baseUrl: "http://localhost:8000/v1/systemone",
		apiKeyEnv: "JEFF_API_KEY",
		model: "jev-latest"
	},
	custom: {
		baseUrl: "",
		apiKeyEnv: "",
		model: "jev-latest"
	}
};
const SYSTEM_ONE_PROVIDERS = [
	"openai",
	"typesafe",
	"jeff",
	"custom"
];
/**
* Tools shaped by default (SPEC §11.1 of the result-shaping SPEC). Only
* command-like tools whose output is bulk, line-oriented and cheaply
* reproducible: everything else — file reads, diffs, searches, structured
* business tools, subagent results — may carry unique evidence that cannot be
* recovered from output shape alone.
*/
const DEFAULT_SHAPE_TOOLS = Object.freeze([
	"bash",
	"terminal",
	"pwsh",
	"run_command",
	"execute_command",
	"run_tests"
]);
/** Archive failure policy (SPEC §24). */
const ARCHIVE_FAILURE_POLICIES = ["keep-original", "shape-anyway"];
/** Defaults mirror the SPEC §22 suggested values. */
const DEFAULTS = Object.freeze({
	enabled: true,
	decision: Object.freeze({ provider: "openai" }),
	jev: Object.freeze({
		model: SYSTEM_ONE_PRESETS.openai.model,
		apiKeyEnv: SYSTEM_ONE_PRESETS.openai.apiKeyEnv,
		baseUrl: SYSTEM_ONE_PRESETS.openai.baseUrl,
		timeoutMs: 15e3,
		maxConcurrency: 4,
		retries: 0
	}),
	trigger: Object.freeze({
		contextRatio: .7,
		minSurfaceTokens: 32e3,
		minCandidates: 4,
		minCandidateChars: 8e3,
		cooldownTurns: 3
	}),
	preserve: Object.freeze({
		recentMessages: 6,
		recentTokens: 12e3,
		errors: true
	}),
	decisions: Object.freeze({
		fullThreshold: .7,
		truncateThreshold: .45
	}),
	state: Object.freeze({
		maxStateTokens: 25e3,
		maxRequestTokens: 3e4,
		toolInputChars: 1e3,
		resultPreviewChars: 300
	}),
	pruning: Object.freeze({
		truncateHeadChars: 384,
		truncateTailChars: 128,
		minSavingsChars: 8e3,
		minSavingsRatio: .05
	}),
	resultShaping: Object.freeze({
		enabled: false,
		includeTools: DEFAULT_SHAPE_TOOLS,
		excludeTools: Object.freeze([]),
		thresholdChars: 12e3,
		hardLengthTriggerChars: 32e3,
		minLines: 80,
		repetitionTriggerRatio: .45,
		maxPerTurn: 2,
		maxConcurrent: 2,
		preserveErrors: true,
		minRunLines: 3,
		keepHeadLines: 8,
		keepTailLines: 12,
		minClassificationConfidence: .6,
		minSavingsChars: 4e3,
		minSavingsRatio: .3,
		requestTimeoutMs: 2500,
		maxInputCharsPerTurn: 5e4
	}),
	archive: Object.freeze({
		enabled: true,
		rootPath: "",
		retentionDays: 14,
		maxBytes: 1073741824,
		deduplicate: true,
		onFailure: "keep-original"
	}),
	privacy: Object.freeze({
		includeUserText: true,
		includeAssistantText: true,
		includeToolArguments: true,
		textChars: 1e3
	}),
	fallback: Object.freeze({ continueOnFailure: true }),
	diagnostics: Object.freeze({
		logLevel: "info",
		includeCandidateScores: false
	})
});
const LEVELS = [
	"trace",
	"debug",
	"info",
	"warn",
	"error",
	"silent"
];
function clampInt(value, min, max, label) {
	if (!Number.isFinite(value)) throw new TypeError(`jev-compaction: ${label} must be a finite number`);
	return Math.min(max, Math.max(min, Math.round(value)));
}
function clampProbability$1(value, label) {
	if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`jev-compaction: ${label} must be within [0, 1]`);
	return value;
}
function resolveLevel(value, fallback) {
	return typeof value === "string" && LEVELS.includes(value) ? value : fallback;
}
/**
* Normalize a tool-name list: drop non-strings and blanks, trim, deduplicate
* case-sensitively (tool names are exact identifiers, not display text).
*/
function resolveToolList(value, fallback) {
	if (!Array.isArray(value)) return fallback;
	const seen = /* @__PURE__ */ new Set();
	for (const entry of value) {
		if (typeof entry !== "string") continue;
		const trimmed = entry.trim();
		if (trimmed.length === 0) continue;
		seen.add(trimmed);
	}
	return Object.freeze([...seen]);
}
function resolveArchivePolicy(value, fallback) {
	return typeof value === "string" && ARCHIVE_FAILURE_POLICIES.includes(value) ? value : fallback;
}
/**
* The legacy flat `jev` block, minus the values the settings layer materializes
* from the shipped defaults.
*
* The legacy block stays an override for deployments that wrote it — but the
* settings service hands the resolver a value with every default filled in, so
* a key equal to its shipped default means "nobody configured this" rather than
* "the deployment chose it". Honouring those would shadow
* `decision.<provider>` — the shape the README documents and the profiles use —
* on every deployment, which is how a self-hosted `jeff` deployment ended up
* asking for `TYPESAFE_API_KEY` and never reached its own scorer.
*/
function legacyOverride(raw, key) {
	const value = raw.jev?.[key];
	if (value === void 0 || value === DEFAULTS.jev[key]) return void 0;
	return value;
}
/**
* Resolve the decision backend endpoint: pick the provider preset, layer the
* `decision.<provider>` overrides on top, then let an explicitly configured
* legacy flat `jev` block override one-for-one. `provider: custom` must carry
* an explicit `baseUrl` — a misconfigured endpoint must fail loudly at
* startup, not silently prune or score against the wrong service.
*/
function resolveEndpoint(raw) {
	const rawDecision = raw.decision ?? {};
	const provider = rawDecision.provider ?? DEFAULTS.decision.provider;
	if (!SYSTEM_ONE_PROVIDERS.includes(provider)) throw new TypeError(`jev-compaction: decision.provider must be one of ${SYSTEM_ONE_PROVIDERS.join(", ")}`);
	const preset = SYSTEM_ONE_PRESETS[provider];
	const override = rawDecision[provider];
	const endpoint = {
		model: legacyOverride(raw, "model") ?? override?.model ?? preset.model,
		apiKeyEnv: legacyOverride(raw, "apiKeyEnv") ?? override?.apiKeyEnv ?? preset.apiKeyEnv,
		baseUrl: legacyOverride(raw, "baseUrl") ?? override?.baseUrl ?? preset.baseUrl
	};
	if (provider === "custom" && endpoint.baseUrl.length === 0) throw new TypeError("jev-compaction: decision.custom.baseUrl is required when provider is custom");
	return {
		decision: { provider },
		endpoint
	};
}
/**
* Normalize raw config: apply defaults, clamp ranges, and enforce the
* threshold ordering. Throws on non-finite scalars and inverted thresholds —
* a misconfigured safety threshold must fail loudly at startup, not silently
* prune or silently do nothing.
*/
function resolveJevCompactionConfig(raw = {}) {
	const decisions = {
		fullThreshold: clampProbability$1(raw.decisions?.fullThreshold ?? DEFAULTS.decisions.fullThreshold, "decisions.fullThreshold"),
		truncateThreshold: clampProbability$1(raw.decisions?.truncateThreshold ?? DEFAULTS.decisions.truncateThreshold, "decisions.truncateThreshold")
	};
	if (decisions.truncateThreshold > decisions.fullThreshold) throw new TypeError("jev-compaction: decisions.truncateThreshold must be <= decisions.fullThreshold");
	const { decision, endpoint } = resolveEndpoint(raw);
	return {
		enabled: raw.enabled ?? DEFAULTS.enabled,
		decision,
		jev: {
			model: endpoint.model,
			apiKeyEnv: endpoint.apiKeyEnv,
			baseUrl: endpoint.baseUrl,
			timeoutMs: clampInt(raw.decision?.timeoutMs ?? raw.jev?.timeoutMs ?? DEFAULTS.jev.timeoutMs, 500, 6e4, "decision.timeoutMs"),
			maxConcurrency: clampInt(raw.decision?.maxConcurrency ?? raw.jev?.maxConcurrency ?? DEFAULTS.jev.maxConcurrency, 1, 8, "decision.maxConcurrency"),
			retries: clampInt(raw.decision?.retries ?? raw.jev?.retries ?? DEFAULTS.jev.retries, 0, 1, "decision.retries")
		},
		trigger: {
			contextRatio: clampProbability$1(raw.trigger?.contextRatio ?? DEFAULTS.trigger.contextRatio, "trigger.contextRatio"),
			minSurfaceTokens: clampInt(raw.trigger?.minSurfaceTokens ?? DEFAULTS.trigger.minSurfaceTokens, 1, Number.MAX_SAFE_INTEGER, "trigger.minSurfaceTokens"),
			minCandidates: clampInt(raw.trigger?.minCandidates ?? DEFAULTS.trigger.minCandidates, 1, 1e4, "trigger.minCandidates"),
			minCandidateChars: clampInt(raw.trigger?.minCandidateChars ?? DEFAULTS.trigger.minCandidateChars, 0, Number.MAX_SAFE_INTEGER, "trigger.minCandidateChars"),
			cooldownTurns: clampInt(raw.trigger?.cooldownTurns ?? DEFAULTS.trigger.cooldownTurns, 0, 1e4, "trigger.cooldownTurns")
		},
		preserve: {
			recentMessages: clampInt(raw.preserve?.recentMessages ?? DEFAULTS.preserve.recentMessages, 0, 1e5, "preserve.recentMessages"),
			recentTokens: clampInt(raw.preserve?.recentTokens ?? DEFAULTS.preserve.recentTokens, 0, Number.MAX_SAFE_INTEGER, "preserve.recentTokens"),
			errors: raw.preserve?.errors ?? DEFAULTS.preserve.errors
		},
		decisions,
		state: {
			maxStateTokens: clampInt(raw.state?.maxStateTokens ?? DEFAULTS.state.maxStateTokens, 1e3, 1e6, "state.maxStateTokens"),
			maxRequestTokens: clampInt(raw.state?.maxRequestTokens ?? DEFAULTS.state.maxRequestTokens, 1e3, 1e6, "state.maxRequestTokens"),
			toolInputChars: clampInt(raw.state?.toolInputChars ?? DEFAULTS.state.toolInputChars, 0, 1e5, "state.toolInputChars"),
			resultPreviewChars: clampInt(raw.state?.resultPreviewChars ?? DEFAULTS.state.resultPreviewChars, 0, 1e5, "state.resultPreviewChars")
		},
		pruning: {
			truncateHeadChars: clampInt(raw.pruning?.truncateHeadChars ?? DEFAULTS.pruning.truncateHeadChars, 0, 1e6, "pruning.truncateHeadChars"),
			truncateTailChars: clampInt(raw.pruning?.truncateTailChars ?? DEFAULTS.pruning.truncateTailChars, 0, 1e6, "pruning.truncateTailChars"),
			minSavingsChars: clampInt(raw.pruning?.minSavingsChars ?? DEFAULTS.pruning.minSavingsChars, 0, Number.MAX_SAFE_INTEGER, "pruning.minSavingsChars"),
			minSavingsRatio: clampProbability$1(raw.pruning?.minSavingsRatio ?? DEFAULTS.pruning.minSavingsRatio, "pruning.minSavingsRatio")
		},
		resultShaping: {
			enabled: raw.resultShaping?.enabled ?? DEFAULTS.resultShaping.enabled,
			includeTools: resolveToolList(raw.resultShaping?.includeTools, DEFAULTS.resultShaping.includeTools),
			excludeTools: resolveToolList(raw.resultShaping?.excludeTools, DEFAULTS.resultShaping.excludeTools),
			thresholdChars: clampInt(raw.resultShaping?.thresholdChars ?? DEFAULTS.resultShaping.thresholdChars, 0, Number.MAX_SAFE_INTEGER, "resultShaping.thresholdChars"),
			hardLengthTriggerChars: clampInt(raw.resultShaping?.hardLengthTriggerChars ?? DEFAULTS.resultShaping.hardLengthTriggerChars, 0, Number.MAX_SAFE_INTEGER, "resultShaping.hardLengthTriggerChars"),
			minLines: clampInt(raw.resultShaping?.minLines ?? DEFAULTS.resultShaping.minLines, 1, 1e6, "resultShaping.minLines"),
			repetitionTriggerRatio: clampProbability$1(raw.resultShaping?.repetitionTriggerRatio ?? DEFAULTS.resultShaping.repetitionTriggerRatio, "resultShaping.repetitionTriggerRatio"),
			maxPerTurn: clampInt(raw.resultShaping?.maxPerTurn ?? DEFAULTS.resultShaping.maxPerTurn, 0, 1e3, "resultShaping.maxPerTurn"),
			maxConcurrent: clampInt(raw.resultShaping?.maxConcurrent ?? DEFAULTS.resultShaping.maxConcurrent, 1, 8, "resultShaping.maxConcurrent"),
			preserveErrors: raw.resultShaping?.preserveErrors ?? DEFAULTS.resultShaping.preserveErrors,
			minRunLines: clampInt(raw.resultShaping?.minRunLines ?? DEFAULTS.resultShaping.minRunLines, 2, 1e3, "resultShaping.minRunLines"),
			keepHeadLines: clampInt(raw.resultShaping?.keepHeadLines ?? DEFAULTS.resultShaping.keepHeadLines, 0, 1e5, "resultShaping.keepHeadLines"),
			keepTailLines: clampInt(raw.resultShaping?.keepTailLines ?? DEFAULTS.resultShaping.keepTailLines, 0, 1e5, "resultShaping.keepTailLines"),
			minClassificationConfidence: clampProbability$1(raw.resultShaping?.minClassificationConfidence ?? DEFAULTS.resultShaping.minClassificationConfidence, "resultShaping.minClassificationConfidence"),
			minSavingsChars: clampInt(raw.resultShaping?.minSavingsChars ?? DEFAULTS.resultShaping.minSavingsChars, 0, Number.MAX_SAFE_INTEGER, "resultShaping.minSavingsChars"),
			minSavingsRatio: clampProbability$1(raw.resultShaping?.minSavingsRatio ?? DEFAULTS.resultShaping.minSavingsRatio, "resultShaping.minSavingsRatio"),
			requestTimeoutMs: clampInt(raw.resultShaping?.requestTimeoutMs ?? DEFAULTS.resultShaping.requestTimeoutMs, 500, 6e4, "resultShaping.requestTimeoutMs"),
			maxInputCharsPerTurn: clampInt(raw.resultShaping?.maxInputCharsPerTurn ?? DEFAULTS.resultShaping.maxInputCharsPerTurn, 0, Number.MAX_SAFE_INTEGER, "resultShaping.maxInputCharsPerTurn")
		},
		archive: {
			enabled: raw.archive?.enabled ?? DEFAULTS.archive.enabled,
			rootPath: raw.archive?.rootPath ?? DEFAULTS.archive.rootPath,
			retentionDays: clampInt(raw.archive?.retentionDays ?? DEFAULTS.archive.retentionDays, 0, 36500, "archive.retentionDays"),
			maxBytes: clampInt(raw.archive?.maxBytes ?? DEFAULTS.archive.maxBytes, 0, Number.MAX_SAFE_INTEGER, "archive.maxBytes"),
			deduplicate: raw.archive?.deduplicate ?? DEFAULTS.archive.deduplicate,
			onFailure: resolveArchivePolicy(raw.archive?.onFailure, DEFAULTS.archive.onFailure)
		},
		privacy: {
			includeUserText: raw.privacy?.includeUserText ?? DEFAULTS.privacy.includeUserText,
			includeAssistantText: raw.privacy?.includeAssistantText ?? DEFAULTS.privacy.includeAssistantText,
			includeToolArguments: raw.privacy?.includeToolArguments ?? DEFAULTS.privacy.includeToolArguments,
			textChars: clampInt(raw.privacy?.textChars ?? DEFAULTS.privacy.textChars, 0, 1e5, "privacy.textChars")
		},
		fallback: { continueOnFailure: raw.fallback?.continueOnFailure ?? DEFAULTS.fallback.continueOnFailure },
		diagnostics: {
			logLevel: resolveLevel(raw.diagnostics?.logLevel, DEFAULTS.diagnostics.logLevel),
			includeCandidateScores: raw.diagnostics?.includeCandidateScores ?? DEFAULTS.diagnostics.includeCandidateScores
		}
	};
}
/** Schemastery schema exposed through the service's static `Config`. */
const JevCompactionConfigSchema = z.object({
	enabled: z.boolean().default(DEFAULTS.enabled).description("Enable Jev compaction."),
	decision: z.object({
		provider: z.string().default(DEFAULTS.decision.provider).description("Decision backend: openai (OpenAI-compatible chat), typesafe, jeff, or custom System One."),
		openai: z.object({
			baseUrl: z.string().description("OpenAI-compatible API base (…/v1)."),
			apiKeyEnv: z.string().description("Environment variable holding the API key."),
			model: z.string().description("Chat model id for scoring.")
		}).description("Overrides for the openai (chat/completions) provider preset."),
		typesafe: z.object({
			baseUrl: z.string().description("TypeSafe System One endpoint."),
			apiKeyEnv: z.string().description("Environment variable holding the TypeSafe API key."),
			model: z.string().description("Jev decision model.")
		}).description("Overrides for the typesafe provider preset."),
		jeff: z.object({
			baseUrl: z.string().description("Self-hosted Jeff endpoint."),
			apiKeyEnv: z.string().description("Environment variable holding the Jeff API key."),
			model: z.string().description("Jev decision model.")
		}).description("Overrides for the self-hosted jeff provider preset."),
		custom: z.object({
			baseUrl: z.string().description("Required System One-compatible endpoint."),
			apiKeyEnv: z.string().description("Environment variable holding the API key; empty disables the Authorization header."),
			model: z.string().description("Jev decision model.")
		}).description("Overrides for the custom provider preset."),
		timeoutMs: z.number().min(500).max(6e4).step(1).description("Per-request timeout in ms."),
		maxConcurrency: z.number().min(1).max(8).step(1).description("Concurrent Jev request cap."),
		retries: z.number().min(0).max(1).step(1).description("Network/5xx retries per batch (0 or 1).")
	}),
	jev: z.object({
		model: z.string().default(DEFAULTS.jev.model).description("Jev decision model (legacy override; prefer decision)."),
		apiKeyEnv: z.string().default(DEFAULTS.jev.apiKeyEnv).description("Environment variable that holds the API key (legacy override; prefer decision)."),
		baseUrl: z.string().default(DEFAULTS.jev.baseUrl).description("Jev endpoint (legacy override; prefer decision)."),
		timeoutMs: z.number().min(500).max(6e4).step(1).default(DEFAULTS.jev.timeoutMs).description("Per-request timeout in ms."),
		maxConcurrency: z.number().min(1).max(8).step(1).default(DEFAULTS.jev.maxConcurrency).description("Concurrent Jev request cap."),
		retries: z.number().min(0).max(1).step(1).default(DEFAULTS.jev.retries).description("Network/5xx retries per batch (0 or 1).")
	}),
	trigger: z.object({
		contextRatio: z.number().min(0).max(1).default(DEFAULTS.trigger.contextRatio).description("Context-window fraction that arms automatic pruning."),
		minSurfaceTokens: z.number().min(1).step(1).default(DEFAULTS.trigger.minSurfaceTokens).description("Minimum estimated surface tokens for automatic pruning."),
		minCandidates: z.number().min(1).step(1).default(DEFAULTS.trigger.minCandidates).description("Minimum eligible candidates for automatic pruning."),
		minCandidateChars: z.number().min(0).step(1).default(DEFAULTS.trigger.minCandidateChars).description("Minimum total candidate characters for automatic pruning."),
		cooldownTurns: z.number().min(0).step(1).default(DEFAULTS.trigger.cooldownTurns).description("Minimum turns between automatic runs.")
	}),
	preserve: z.object({
		recentMessages: z.number().min(0).step(1).default(DEFAULTS.preserve.recentMessages).description("Newest surface positions never touched."),
		recentTokens: z.number().min(0).step(1).default(DEFAULTS.preserve.recentTokens).description("Newest token budget never touched."),
		errors: z.boolean().default(DEFAULTS.preserve.errors).description("Pin error results regardless of score.")
	}),
	decisions: z.object({
		fullThreshold: z.number().min(0).max(1).default(DEFAULTS.decisions.fullThreshold).description("needContents at or above this keeps the result full."),
		truncateThreshold: z.number().min(0).max(1).default(DEFAULTS.decisions.truncateThreshold).description("needContents at or above this keeps a truncated head/tail.")
	}),
	state: z.object({
		maxStateTokens: z.number().min(1e3).step(1).default(DEFAULTS.state.maxStateTokens).description("Estimated token ceiling for the Jev state."),
		maxRequestTokens: z.number().min(1e3).step(1).default(DEFAULTS.state.maxRequestTokens).description("Estimated token ceiling for state plus one question batch."),
		toolInputChars: z.number().min(0).step(1).default(DEFAULTS.state.toolInputChars).description("Tool argument preview characters in the state."),
		resultPreviewChars: z.number().min(0).step(1).default(DEFAULTS.state.resultPreviewChars).description("Result preview characters in the state.")
	}),
	pruning: z.object({
		truncateHeadChars: z.number().min(0).step(1).default(DEFAULTS.pruning.truncateHeadChars).description("Head characters kept by truncation."),
		truncateTailChars: z.number().min(0).step(1).default(DEFAULTS.pruning.truncateTailChars).description("Tail characters kept by truncation."),
		minSavingsChars: z.number().min(0).step(1).default(DEFAULTS.pruning.minSavingsChars).description("Skip mutation below this many saved characters."),
		minSavingsRatio: z.number().min(0).max(1).default(DEFAULTS.pruning.minSavingsRatio).description("Skip mutation below this fraction of candidate characters.")
	}),
	resultShaping: z.object({
		enabled: z.boolean().default(DEFAULTS.resultShaping.enabled).description("Immediate semantic shaping of large tool outputs before they are persisted."),
		includeTools: z.array(z.string()).default([...DEFAULTS.resultShaping.includeTools]).description("Tools whose results may be shaped."),
		excludeTools: z.array(z.string()).default([...DEFAULTS.resultShaping.excludeTools]).description("Tools whose results are never shaped; wins over the allowlist."),
		thresholdChars: z.number().min(0).step(1).default(DEFAULTS.resultShaping.thresholdChars).description("Minimum text length before shaping is considered."),
		hardLengthTriggerChars: z.number().min(0).step(1).default(DEFAULTS.resultShaping.hardLengthTriggerChars).description("Length that triggers shaping without line structure."),
		minLines: z.number().min(1).step(1).default(DEFAULTS.resultShaping.minLines).description("Minimum line count for the line-structure trigger."),
		repetitionTriggerRatio: z.number().min(0).max(1).default(DEFAULTS.resultShaping.repetitionTriggerRatio).description("Minimum collapsible-line ratio for the repetition trigger."),
		maxPerTurn: z.number().min(0).step(1).default(DEFAULTS.resultShaping.maxPerTurn).description("Shaping requests allowed per turn."),
		maxConcurrent: z.number().min(1).max(8).step(1).default(DEFAULTS.resultShaping.maxConcurrent).description("Concurrent shaping requests."),
		preserveErrors: z.boolean().default(DEFAULTS.resultShaping.preserveErrors).description("Leave failed tool results untouched."),
		minRunLines: z.number().min(2).step(1).default(DEFAULTS.resultShaping.minRunLines).description("Minimum run length that may collapse into one marker."),
		keepHeadLines: z.number().min(0).step(1).default(DEFAULTS.resultShaping.keepHeadLines).description("Head lines pinned from collapsing."),
		keepTailLines: z.number().min(0).step(1).default(DEFAULTS.resultShaping.keepTailLines).description("Tail lines pinned from collapsing."),
		minClassificationConfidence: z.number().min(0).max(1).default(DEFAULTS.resultShaping.minClassificationConfidence).description("Minimum confidence to act on a classification."),
		minSavingsChars: z.number().min(0).step(1).default(DEFAULTS.resultShaping.minSavingsChars).description("Skip shaping below this many saved characters."),
		minSavingsRatio: z.number().min(0).max(1).default(DEFAULTS.resultShaping.minSavingsRatio).description("Skip shaping below this fraction of the original characters."),
		requestTimeoutMs: z.number().min(500).max(6e4).step(1).default(DEFAULTS.resultShaping.requestTimeoutMs).description("Per-request timeout for shaping in ms."),
		maxInputCharsPerTurn: z.number().min(0).step(1).default(DEFAULTS.resultShaping.maxInputCharsPerTurn).description("Character budget for shaping requests per turn.")
	}).description("Immediate result shaping at tools/post-execute."),
	archive: z.object({
		enabled: z.boolean().default(DEFAULTS.archive.enabled).description("Archive the original rendered result before shaping it."),
		rootPath: z.string().default(DEFAULTS.archive.rootPath).description("Archive root; empty resolves under the harness home data directory."),
		retentionDays: z.number().min(0).step(1).default(DEFAULTS.archive.retentionDays).description("Retention window in days; 0 keeps entries forever."),
		maxBytes: z.number().min(0).step(1).default(DEFAULTS.archive.maxBytes).description("Retention ceiling in bytes; 0 disables the size cap."),
		deduplicate: z.boolean().default(DEFAULTS.archive.deduplicate).description("Reuse content-addressed entries instead of duplicating."),
		onFailure: z.union([...ARCHIVE_FAILURE_POLICIES]).default(DEFAULTS.archive.onFailure).description("Archive failure policy: keep-original (recommended) or shape-anyway.")
	}).description("Plugin-owned archive of pre-shaping tool output."),
	privacy: z.object({
		includeUserText: z.boolean().default(DEFAULTS.privacy.includeUserText).description("Include bounded user text in the Jev state."),
		includeAssistantText: z.boolean().default(DEFAULTS.privacy.includeAssistantText).description("Include bounded assistant text in the Jev state."),
		includeToolArguments: z.boolean().default(DEFAULTS.privacy.includeToolArguments).description("Include tool argument previews in the Jev state."),
		textChars: z.number().min(0).step(1).default(DEFAULTS.privacy.textChars).description("Per-message user/assistant text budget in characters.")
	}),
	fallback: z.object({ continueOnFailure: z.boolean().default(DEFAULTS.fallback.continueOnFailure).description("Fail-open: never block the agent loop on plugin failures.") }),
	diagnostics: z.object({
		logLevel: z.string().default(DEFAULTS.diagnostics.logLevel).description("Structured log level for plugin events."),
		includeCandidateScores: z.boolean().default(DEFAULTS.diagnostics.includeCandidateScores).description("Include per-candidate scores in reports.")
	})
});
//#endregion
//#region src/dsh/meter.ts
function routedTarget(session) {
	const header = session.requestHeader?.();
	const provider = header?.config.provider;
	const model = header?.config.model;
	if (typeof provider !== "string" || provider.length === 0) return void 0;
	if (typeof model !== "string" || model.length === 0) return void 0;
	return {
		provider,
		model
	};
}
/**
* Measure the current session pressure. Never throws on capacity lookup
* failures — an unresolvable window degrades the snapshot, it does not fail
* the run (SPEC §4 fail-open).
*/
async function measurePressure(session, tokenMeter, llm, signal) {
	const measurement = tokenMeter.measure(session);
	const snapshot = {
		estimatedSurfaceTokens: measurement.surfaceTokens,
		totalTokens: measurement.totalTokens
	};
	const target = routedTarget(session);
	if (target !== void 0 && llm !== void 0) try {
		const contextWindow = (await llm.resolveModelInfo(target.provider, target.model, signal)).context?.contextWindow;
		if (typeof contextWindow === "number" && contextWindow > 0) {
			snapshot.contextWindow = contextWindow;
			snapshot.ratio = measurement.totalTokens / contextWindow;
		}
	} catch {}
	return snapshot;
}
/** Newest-token pin window: per-node heuristic prices from the meter. */
function surfaceNodeTokens(tokenMeter, session) {
	const tokens = /* @__PURE__ */ new Map();
	try {
		for (const node of tokenMeter.measure(session).nodes) tokens.set(node.seq, node.heuristicTokens);
	} catch {}
	return tokens;
}
//#endregion
//#region src/dsh/surface.ts
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
function isTextOnly(blocks) {
	return blocks.length > 0 && blocks.every((block) => block.type === "text");
}
function joinText(blocks) {
	return blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}
/**
* Normalize a tool/result message from either DSH shape.
* Returns undefined when the payload is incomplete or call ids disagree.
*/
function normalizeToolResultMessage(message) {
	if (message === null || typeof message !== "object") return void 0;
	const msg = message;
	const sourceCallId = msg.source?.callId;
	if (typeof sourceCallId !== "string" || sourceCallId.length === 0) return void 0;
	if (!Array.isArray(msg.content) || msg.content.length === 0) return void 0;
	if (typeof msg.toolCallId === "string") {
		if (msg.toolCallId !== sourceCallId) return void 0;
		const blocks = msg.content;
		if (!blocks.every((block) => typeof block?.type === "string")) return void 0;
		return {
			callId: sourceCallId,
			isError: msg.isError === true,
			textOnly: isTextOnly(blocks),
			text: joinText(blocks),
			flat: true
		};
	}
	const block = msg.content[0];
	if (block === void 0 || typeof block.toolCallId !== "string" || block.toolCallId !== sourceCallId || !Array.isArray(block.content)) return;
	return {
		callId: sourceCallId,
		isError: block.isError === true,
		textOnly: isTextOnly(block.content),
		text: joinText(block.content),
		flat: false
	};
}
/** Read the ordered current surface events (one pass, no rescans). */
function readSurfaceEvents(session) {
	const events = [];
	for (const seq of session.surface.nodes) {
		const event = session.eventAt(seq);
		if (event !== void 0) events.push(event);
	}
	return events;
}
/** Index every `tool/call` in the log by callId (one pass over the log). */
function buildCallIndex(session) {
	const index = /* @__PURE__ */ new Map();
	for (const event of session.snapshotEvents()) {
		if (event.type !== "tool/call") continue;
		const data = event.data;
		index.set(data.callId, {
			seq: event.seq,
			callId: data.callId,
			name: data.name,
			arguments: data.arguments,
			turn: data.turn,
			step: data.step
		});
	}
	return index;
}
/** True when the result carries only text blocks (v1 mutation domain). */
function hasOnlyTextBlocks(event) {
	return normalizeToolResultMessage(event.data.message)?.textOnly === true;
}
/** Capture the surface identity used to detect drift across async work. */
function captureSurfaceSnapshot(session) {
	return {
		replaceGeneration: session.surface.replaceGeneration,
		nodes: [...session.surface.nodes]
	};
}
/**
* Revalidate a snapshot right before mutation: the generation must be
* unchanged and every planned seq must still be a current `tool/result`
* surface node with text-only blocks.
*/
function isSnapshotFresh(session, snapshot, plannedSeqs) {
	if (session.surface.replaceGeneration !== snapshot.replaceGeneration) return false;
	const nodes = session.surface.nodes;
	for (const seq of plannedSeqs) {
		if (!nodes.some((node) => node === seq)) return false;
		const event = session.eventAt(seq);
		if (event === void 0 || event.type !== "tool/result") return false;
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
function appendToolResultReplacement(session, original, replacementText) {
	const normalized = normalizeToolResultMessage(original.data.message);
	if (normalized === void 0) throw new Error("tool/result message shape is not replaceable");
	const content = [{
		type: "text",
		text: replacementText
	}];
	let message;
	if (normalized.flat) message = freezeMessage({
		...original.data.message,
		content
	});
	else {
		const result = original.data.message.content[0];
		message = freezeMessage({
			...original.data.message,
			content: [{
				...result,
				content
			}]
		});
	}
	return session.append("tool/result", {
		...original.data,
		message
	}, {
		surfaceOp: {
			op: "replace",
			startSeq: original.seq,
			endSeq: original.seq
		},
		sourceEventSeqs: [original.seq]
	}).seq;
}
//#endregion
//#region src/jev/validate.ts
/** Error thrown for any invalid Jev response body. */
var JevInvalidResponseError = class extends Error {
	constructor(message) {
		super(`jev-compaction: invalid Jev response: ${message}`);
		this.name = "JevInvalidResponseError";
	}
};
/**
* Validate one raw HTTP body against the requested questions.
*
* @returns the probability map keyed by question name.
*/
function validateJevResponse(rawText, questions) {
	let parsed;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		throw new JevInvalidResponseError("malformed JSON");
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new JevInvalidResponseError("response is not an object");
	const answers = parsed.answers;
	if (answers === null || typeof answers !== "object" || Array.isArray(answers)) throw new JevInvalidResponseError("response is missing an answers object");
	const record = answers;
	const validated = /* @__PURE__ */ new Map();
	for (const question of questions) {
		const answer = record[question.name];
		if (answer === void 0 || answer === null || typeof answer !== "object") throw new JevInvalidResponseError(`missing answer for ${question.name}`);
		const noul = answer.noul;
		if (typeof noul !== "number" || !Number.isFinite(noul)) throw new JevInvalidResponseError(`non-numeric probability for ${question.name}`);
		if (noul < 0 || noul > 1) throw new JevInvalidResponseError(`probability out of range for ${question.name}`);
		validated.set(question.name, noul);
	}
	return validated;
}
//#endregion
//#region src/jev/backend.ts
/** Error for expected Jev transport failures (timeout, HTTP, auth). */
var JevTransportError = class extends Error {
	constructor(message) {
		super(`jev-compaction: Jev transport failed: ${message}`);
		this.name = "JevTransportError";
	}
};
/** Error thrown when the configured API key environment variable is unset. */
var JevApiKeyMissingError = class extends Error {
	constructor(envName, provider, endpoint) {
		const where = provider === void 0 ? "" : ` for the "${provider}" decision backend${endpoint === void 0 || endpoint === "" ? "" : ` (${endpoint})`}`;
		super(`jev-compaction: ${envName} is not configured${where} — set the variable in the deployment environment, or point decision.provider at a backend that needs no key`);
		this.name = "JevApiKeyMissingError";
	}
};
/**
* The backend whose API key variable is not set, or nothing when there is
* nothing to warn about.
*
* An empty `apiKeyEnv` is a deliberate keyless deployment (the custom provider
* documents it), so it is never reported. Everything else is: a key that is
* missing at startup fails every decision later, and the failure names only the
* variable — this report names the provider and the endpoint too, which is what
* tells an operator which backend is actually configured.
*/
function missingCredential(decision, endpoint, env) {
	const apiKeyEnv = endpoint.apiKeyEnv.trim();
	if (apiKeyEnv === "") return void 0;
	const value = env[apiKeyEnv];
	if (typeof value === "string" && value.trim() !== "") return void 0;
	return {
		provider: decision.provider,
		apiKeyEnv,
		endpoint: systemOneEndpoint(endpoint.baseUrl)
	};
}
function systemOneEndpoint(baseUrl) {
	const trimmed = baseUrl.trim().replace(/\/+$/u, "");
	if (trimmed === "") return "";
	try {
		const parsed = new URL(trimmed);
		if (parsed.pathname === "" || parsed.pathname === "/") return `${trimmed}/v1/systemone`;
	} catch {}
	return trimmed;
}
/** Combine the caller's signal with a timeout into one abort controller. */
function withTimeout$1(signal, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error("jev request timed out")), timeoutMs);
	const onAbort = () => controller.abort(signal?.reason);
	if (signal !== void 0) {
		if (signal.aborted) {
			clearTimeout(timer);
			controller.abort(signal.reason);
			return controller;
		}
		signal.addEventListener("abort", onAbort, { once: true });
	}
	controller.signal.addEventListener("abort", () => {
		clearTimeout(timer);
		if (signal !== void 0) signal.removeEventListener("abort", onAbort);
	}, { once: true });
	return controller;
}
function delay$1(ms, signal) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		if (signal !== void 0) signal.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(new JevTransportError("cancelled"));
		}, { once: true });
	});
}
/** The live System One decision backend over HTTP. */
var SystemOneClient = class {
	/**
	* Either a frozen config or a provider read per request, so a live settings
	* change (endpoint, key variable, timeout, retries) reaches the wire without
	* rebuilding the client.
	*/
	configSource;
	fetcher;
	constructor(config, fetcher = fetch) {
		this.configSource = typeof config === "function" ? config : () => config;
		this.fetcher = fetcher;
	}
	get config() {
		return this.configSource();
	}
	/** Resolve the key from the configured env var; empty env name = keyless. */
	apiKey() {
		const envName = this.config.jev.apiKeyEnv;
		if (envName.length === 0) return void 0;
		const value = process.env[envName];
		if (typeof value !== "string" || value.length === 0) throw new JevApiKeyMissingError(envName, this.config.decision.provider, systemOneEndpoint(this.config.jev.baseUrl));
		return value;
	}
	async attempt(state, questions, signal) {
		const apiKey = this.apiKey();
		const controller = withTimeout$1(signal, this.config.jev.timeoutMs);
		const endpoint = systemOneEndpoint(this.config.jev.baseUrl);
		try {
			const response = await this.fetcher(endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...apiKey === void 0 ? {} : { authorization: `Bearer ${apiKey}` }
				},
				body: JSON.stringify({
					model: this.config.jev.model,
					state,
					questions: Object.fromEntries(questions.map((question) => [question.name, {
						type: "noul",
						instructions: question.instructions
					}]))
				}),
				signal: controller.signal
			});
			const text = await response.text();
			if (!response.ok) throw new JevTransportError(`HTTP ${response.status}: ${text.slice(0, 200)}`);
			return validateJevResponse(text, questions);
		} catch (error) {
			if (error instanceof JevTransportError) throw error;
			if (error instanceof JevInvalidResponseError) throw error;
			if (error instanceof Error && /timed out|aborted|cancelled/i.test(error.message)) throw new JevTransportError(error.message);
			throw new JevTransportError(error instanceof Error ? error.message : String(error));
		}
	}
	async score(state, questions, signal) {
		try {
			return await this.attempt(state, questions, signal);
		} catch (error) {
			if (!(error instanceof JevTransportError && /\b5\d\d\b|network|fetch failed|ECONN|timed out/i.test(error.message)) || this.config.jev.retries < 1) throw error;
			await delay$1(200, signal);
			return this.attempt(state, questions, signal);
		}
	}
};
//#endregion
//#region src/jev/openai-backend.ts
/** Normalize `…/v1` or `…/v1/` into the chat completions URL. */
function chatCompletionsUrl(baseUrl) {
	const trimmed = baseUrl.trim().replace(/\/+$/u, "");
	if (trimmed === "") throw new JevTransportError("openai baseUrl is empty");
	if (/\/chat\/completions$/u.test(trimmed)) return trimmed;
	if (/\/v1$/u.test(trimmed)) return `${trimmed}/chat/completions`;
	try {
		const parsed = new URL(trimmed);
		if (parsed.pathname === "" || parsed.pathname === "/") return `${trimmed}/v1/chat/completions`;
	} catch {}
	return `${trimmed}/chat/completions`;
}
function withTimeout(signal, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error("jev request timed out")), timeoutMs);
	const onAbort = () => controller.abort(signal?.reason);
	if (signal !== void 0) {
		if (signal.aborted) {
			clearTimeout(timer);
			controller.abort(signal.reason);
			return controller;
		}
		signal.addEventListener("abort", onAbort, { once: true });
	}
	controller.signal.addEventListener("abort", () => {
		clearTimeout(timer);
		if (signal !== void 0) signal.removeEventListener("abort", onAbort);
	}, { once: true });
	return controller;
}
function delay(ms, signal) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		if (signal !== void 0) signal.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(new JevTransportError("cancelled"));
		}, { once: true });
	});
}
function buildPrompt(state, questions) {
	const history = state.history.map((entry) => `- ${entry.label}: ${entry.text}`).join("\n");
	const qs = questions.map((q, i) => `${i + 1}. name=${JSON.stringify(q.name)}\n   instructions: ${q.instructions}`).join("\n");
	return [
		"You score whether historical tool results are still needed in a coding-agent context.",
		"Reply with ONLY a JSON object of this exact shape:",
		"{\"answers\":{\"<question-name>\":{\"noul\":<number 0..1>},...}}",
		"noul is P(yes) for the yes/no instructions. No markdown fences.",
		"",
		`context: ${state.context}`,
		`goal: ${state.goal}`,
		"history:",
		history || "(empty)",
		"",
		"questions:",
		qs
	].join("\n");
}
function parseChatAnswers(text, questions) {
	let raw;
	try {
		const trimmed = text.trim();
		const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
		raw = JSON.parse(fence ? fence[1].trim() : trimmed);
	} catch (error) {
		throw new JevInvalidResponseError(`openai decision JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!raw || typeof raw !== "object") throw new JevInvalidResponseError("openai decision root must be an object");
	const root = raw;
	const answersRaw = root.answers && typeof root.answers === "object" ? root.answers : root;
	const out = /* @__PURE__ */ new Map();
	for (const question of questions) {
		const entry = answersRaw[question.name];
		let noul;
		if (typeof entry === "number") noul = entry;
		else if (entry && typeof entry === "object") noul = entry.noul;
		if (typeof noul !== "number" || !Number.isFinite(noul)) throw new JevInvalidResponseError(`openai decision missing noul for ${question.name}`);
		out.set(question.name, Math.min(1, Math.max(0, noul)));
	}
	return out;
}
function messageContent(payload) {
	if (!payload || typeof payload !== "object") return "";
	const choices = payload.choices;
	if (!Array.isArray(choices) || choices.length === 0) return "";
	const content = choices[0].message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map((part) => part && typeof part === "object" && "text" in part ? String(part.text) : "").join("");
	return "";
}
/** Live OpenAI-compatible chat decision backend. */
var OpenAIChatDecisionClient = class {
	configSource;
	fetcher;
	constructor(config, fetcher = fetch) {
		this.configSource = typeof config === "function" ? config : () => config;
		this.fetcher = fetcher;
	}
	get config() {
		return this.configSource();
	}
	/** this-that / this_that model ids use choice protocol only (no free-form chat). */
	useChoiceProtocol() {
		const model = this.config.jev.model.toLowerCase();
		return model.includes("this-that") || model.includes("this_that");
	}
	apiKey() {
		const envName = this.config.jev.apiKeyEnv;
		if (envName.length === 0) return void 0;
		const value = process.env[envName];
		if (typeof value !== "string" || value.length === 0) throw new JevApiKeyMissingError(envName, this.config.decision.provider, chatCompletionsUrl(this.config.jev.baseUrl));
		return value;
	}
	async attempt(state, questions, signal) {
		const apiKey = this.apiKey();
		const controller = withTimeout(signal, this.config.jev.timeoutMs);
		const endpoint = chatCompletionsUrl(this.config.jev.baseUrl);
		const headers = { "content-type": "application/json" };
		if (apiKey !== void 0) {
			headers.authorization = `Bearer ${apiKey}`;
			headers["x-litellm-api-key"] = apiKey;
			headers["x-api-key"] = apiKey;
		}
		try {
			const response = await this.fetcher(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({
					model: this.config.jev.model,
					temperature: 0,
					response_format: { type: "json_object" },
					messages: [{
						role: "system",
						content: "You are a scoring function. Output only the required JSON object."
					}, {
						role: "user",
						content: buildPrompt(state, questions)
					}]
				}),
				signal: controller.signal
			});
			const text = await response.text();
			if (!response.ok) throw new JevTransportError(`HTTP ${response.status}: ${text.slice(0, 200)}`);
			let payload = text;
			try {
				payload = JSON.parse(text);
			} catch {}
			return parseChatAnswers((typeof payload === "object" && payload !== null && "choices" in payload ? messageContent(payload) : text) || text, questions);
		} catch (error) {
			if (error instanceof JevTransportError) throw error;
			if (error instanceof JevInvalidResponseError) throw error;
			if (error instanceof Error && /timed out|aborted|cancelled/i.test(error.message)) throw new JevTransportError(error.message);
			throw new JevTransportError(error instanceof Error ? error.message : String(error));
		}
	}
	async attemptChoice(state, questions, signal) {
		const out = /* @__PURE__ */ new Map();
		for (const question of questions) {
			const apiKey = this.apiKey();
			const controller = withTimeout(signal, this.config.jev.timeoutMs);
			const endpoint = chatCompletionsUrl(this.config.jev.baseUrl);
			const headers = { "content-type": "application/json" };
			if (apiKey !== void 0) {
				headers.authorization = `Bearer ${apiKey}`;
				headers["x-litellm-api-key"] = apiKey;
				headers["x-api-key"] = apiKey;
			}
			const user = [
				"Answer yes or no to the following question about a coding-agent context.",
				`context: ${state.context}`,
				`goal: ${state.goal}`,
				"history:",
				state.history.map((e) => `- ${e.label}: ${e.text}`).join("\n") || "(empty)",
				"",
				`question (${question.name}): ${question.instructions}`
			].join("\n");
			const response = await this.fetcher(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({
					model: this.config.jev.model,
					messages: [{
						role: "user",
						content: user
					}],
					response_format: {
						type: "json_schema",
						json_schema: {
							name: "choice",
							strict: true,
							schema: {
								type: "object",
								properties: { answer: {
									type: "string",
									enum: ["yes", "no"]
								} },
								required: ["answer"],
								additionalProperties: false
							}
						}
					}
				}),
				signal: controller.signal
			});
			const text = await response.text();
			if (!response.ok) throw new JevTransportError(`HTTP ${response.status}: ${text.slice(0, 200)}`);
			let payload;
			try {
				payload = JSON.parse(text);
			} catch (error) {
				throw new JevInvalidResponseError(`choice response JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			let noul = payload.this_that?.probabilities?.yes;
			if (typeof noul !== "number") {
				const content = messageContent(payload);
				try {
					const parsed = JSON.parse(content);
					if (parsed.answer === "yes") noul = 1;
					else if (parsed.answer === "no") noul = 0;
				} catch {}
			}
			if (typeof noul !== "number" || !Number.isFinite(noul)) throw new JevInvalidResponseError(`choice model missing probability for ${question.name}`);
			out.set(question.name, Math.min(1, Math.max(0, noul)));
		}
		return out;
	}
	async score(state, questions, signal) {
		const run = () => this.useChoiceProtocol() ? this.attemptChoice(state, questions, signal) : this.attempt(state, questions, signal);
		try {
			return await run();
		} catch (error) {
			if (!(error instanceof JevTransportError && /\b5\d\d\b|network|fetch failed|ECONN|timed out/i.test(error.message)) || this.config.jev.retries < 1) throw error;
			await delay(200, signal);
			return run();
		}
	}
};
//#endregion
//#region src/jev/types.ts
/** Jev-compatible token estimate for state/request fitting. */
function estimateStateTokens(text) {
	let tokens = 0;
	for (const match of text.matchAll(/[A-Za-z]+|\d+|\s+|[^\sA-Za-z\d]/g)) {
		const piece = match[0];
		const first = piece.charCodeAt(0);
		if (first >= 48 && first <= 57) tokens += piece.length / 2;
		else if (first >= 65 && first <= 90 || first >= 97 && first <= 122) tokens += 1 + Math.floor((piece.length - 1) / 6);
		else if (first >= 9 && first <= 13 || first === 32) tokens += .25;
		else tokens += .9;
	}
	return Math.ceil(tokens);
}
//#endregion
//#region src/jev/questions.ts
/** Build the question list for one batch of candidates. */
function questionsFor(candidates) {
	const questions = [];
	for (const candidate of candidates) {
		const name = candidate.callId;
		const tool = candidate.toolName ?? "unknown";
		questions.push({
			name: `needContents_${name}`,
			instructions: `Does the agent still need the substantive contents of tool result ${name} (${tool}, ${candidate.originalChars} chars, args ${candidate.toolArgumentsPreview ?? "{}"}) to correctly continue the user's current task?`
		});
		questions.push({
			name: `needVerbatim_${name}`,
			instructions: `Does tool result ${name} need to remain substantially verbatim, rather than being replaced by a short replay marker describing the tool and the fact that its old output was pruned (the original stays recoverable from the session log)?`
		});
	}
	return questions;
}
//#endregion
//#region src/jev/batch.ts
/** Split candidates into batches that fit one request each. */
function batchCandidates(candidates, stateTokens, maxRequestTokens) {
	const questionTokens = /* @__PURE__ */ new Map();
	const perCandidateTokens = (candidate) => {
		let cached = questionTokens.get(candidate.callId);
		if (cached === void 0) {
			cached = estimateStateTokens(JSON.stringify(questionsFor([candidate])));
			questionTokens.set(candidate.callId, cached);
		}
		return cached;
	};
	const batches = [];
	let current = [];
	let currentTokens = stateTokens;
	for (const candidate of candidates) {
		const cost = perCandidateTokens(candidate);
		if (current.length > 0 && currentTokens + cost > maxRequestTokens) {
			batches.push(current);
			current = [];
			currentTokens = stateTokens;
		}
		current.push(candidate);
		currentTokens += cost;
	}
	if (current.length > 0) batches.push(current);
	return batches;
}
/**
* Run batch tasks with a bounded concurrency pool; results resolve in input
* order. A rejected task rejects the whole pool (the caller fails open).
*/
async function mapWithConcurrency(inputs, limit, task) {
	const results = new Array(inputs.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.max(1, Math.min(limit, inputs.length)) }, async () => {
		while (cursor < inputs.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await task(inputs[index], index);
		}
	});
	await Promise.all(workers);
	return results;
}
//#endregion
//#region src/planner/features.ts
/** Tools whose output is normally cheap to reproduce. */
const CHEAP_RERUN_TOOLS = /* @__PURE__ */ new Set([
	"read",
	"ls",
	"list",
	"glob",
	"grep",
	"search",
	"find",
	"cat",
	"stat",
	"which"
]);
/** Tools whose output is normally expensive or impossible to reproduce. */
const EXPENSIVE_RERUN_TOOLS = /* @__PURE__ */ new Set([
	"web_fetch",
	"fetch",
	"http",
	"browser",
	"jira_search",
	"jira_get_issue",
	"confluence_search",
	"send_message",
	"mail"
]);
const EXACT_EVIDENCE_PATTERNS = [
	/at\s+.*:\d+:\d+/,
	/^\s*at\s+/m,
	/\berror\s+TS\d+:/,
	/\b[A-Fa-f0-9]{40}\b/,
	/\b[A-Fa-f0-9]{32}\b/,
	/https?:\/\/\S+/,
	/\b[A-Z]{3,10}-\d+\b/
];
function extractCommand(preview) {
	if (preview === void 0) return void 0;
	try {
		const parsed = JSON.parse(preview);
		if (parsed !== null && typeof parsed === "object") {
			const record = parsed;
			for (const key of [
				"command",
				"cmd",
				"script"
			]) {
				const value = record[key];
				if (typeof value === "string" && value.length > 0) return value;
			}
		}
	} catch {}
}
function classifyRerunnable(toolName, command) {
	const name = (toolName ?? "").toLowerCase();
	if (EXPENSIVE_RERUN_TOOLS.has(name)) return "expensive";
	if (CHEAP_RERUN_TOOLS.has(name)) return "cheap";
	if (command !== void 0) {
		if (/(^|\s)(test|vitest|jest|pytest|go\s+test|build|compile)\b/i.test(command)) return "cheap";
		if (/\b(curl|wget|deploy|publish|install)\b/i.test(command)) return "expensive";
		return "moderate";
	}
	return "unknown";
}
function matchesEvidence(text) {
	return EXACT_EVIDENCE_PATTERNS.some((pattern) => pattern.test(text));
}
/** Extracted path-like tokens from the arguments preview, for comparisons. */
function extractPaths(preview) {
	if (preview === void 0) return [];
	const paths = [];
	try {
		const parsed = JSON.parse(preview);
		if (parsed !== null && typeof parsed === "object") {
			const record = parsed;
			for (const value of Object.values(record)) if (typeof value === "string" && (value.includes("/") || value.includes("\\"))) paths.push(value);
		}
	} catch {}
	return paths;
}
function sameTarget(a, b) {
	if (a.command !== void 0 && b.command !== void 0) return a.command === b.command;
	if (a.toolName !== void 0 && a.toolName === b.toolName) return true;
	return false;
}
/**
* Compute deterministic features for every candidate.
*
* Supersession: a later call to the same tool targeting the same path (or
* the same command) marks the older result. Superseded reads of a path that
* also saw an intermediate write are the strongest stale signal, but v1
* keeps this advisory either way (SPEC §10.1).
*/
function extractFeatures(candidates, callIndex) {
	const features = /* @__PURE__ */ new Map();
	const enriched = candidates.map((candidate) => {
		const info = callIndex.get(candidate.callId);
		const preview = candidate.toolArgumentsPreview ?? info?.arguments;
		return {
			candidate,
			command: extractCommand(preview),
			paths: extractPaths(preview)
		};
	});
	for (const { candidate, command } of enriched) {
		const byId = callIndex.get(candidate.callId);
		const later = enriched.filter((other) => other.candidate.surfaceSeq > candidate.surfaceSeq && sameTarget({
			toolName: candidate.toolName,
			command
		}, {
			toolName: other.candidate.toolName,
			command: other.command
		}));
		const superseded = later.length > 0 && (candidate.toolName === void 0 || later.some((other) => other.candidate.toolName === candidate.toolName));
		const duplicateLike = later.some((other) => other.candidate.toolName === candidate.toolName && other.candidate.toolArgumentsPreview === candidate.toolArgumentsPreview && byId?.arguments === callIndex.get(other.candidate.callId)?.arguments);
		features.set(candidate.callId, {
			superseded,
			duplicateLike,
			rerunnable: classifyRerunnable(candidate.toolName, command),
			containsLikelyExactEvidence: matchesEvidence(candidate.originalText),
			...candidate.alreadyShaped === true ? { alreadyShaped: true } : {}
		});
	}
	return features;
}
/** One-line feature summary rendered into the Jev state (SPEC §11). */
function formatFeatures(features) {
	if (features === void 0) return "none";
	const parts = [];
	if (features.superseded) parts.push("superseded:true");
	if (features.duplicateLike) parts.push("duplicateLike:true");
	parts.push(`rerunnable:${features.rerunnable}`);
	if (features.containsLikelyExactEvidence) parts.push("exactEvidence:true");
	if (features.alreadyShaped === true) parts.push("alreadyShaped:true");
	return parts.length > 0 ? parts.join("; ") : "none";
}
//#endregion
//#region src/jev/state.ts
const STATE_CONTEXT = "A coding assistant conversation is being compacted to free context. `history` is the whole conversation so far, oldest first; tool outputs are replaced by a short note and long texts may be abridged. Each question asks whether one historical tool result still needs to remain in the model context, and whether it must remain verbatim. Pruned outputs are recoverable from the session log, and the assistant can always re-run a tool or re-read a file if needed.";
/** Text blocks of one message event, flattened (user/message is bare). */
function messageText(event) {
	const data = event.data;
	const content = data.message?.content ?? data.content;
	if (!Array.isArray(content)) return "";
	return content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
}
function truncate$1(text, limit) {
	if (limit <= 0) return "";
	return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}\u2026`;
}
function abridge(text, head, tail) {
	if (text.length <= head + tail + 40) return text;
	const omitted = text.length - head - tail;
	return `${text.slice(0, head)}\n[\u2026 ${omitted} chars omitted \u2026]\n${text.slice(-tail)}`;
}
/** The recent task goal: last user prompts (bounded). */
function goalFromSession(session, config) {
	const goals = [];
	const events = session.snapshotEvents();
	for (let index = events.length - 1; index >= 0 && goals.length < 3; index -= 1) {
		const event = events[index];
		if (event.type !== "user/message") continue;
		const text = messageText(event).trim();
		if (text.length === 0) continue;
		goals.unshift(truncate$1(text, 500));
	}
	return goals.join("\n") || "(no recent user text)";
}
/**
* Build the full (unfitted) state. Deterministic: the same surface read
* always produces the same history and the same candidate ids.
*/
function buildState(session, inputs, config) {
	const candidateByCallId = new Map(inputs.candidates.map((c) => [c.callId, c]));
	const events = session.snapshotEvents();
	const history = [];
	const privacy = config.privacy;
	const textBudget = privacy.textChars;
	for (const event of events) {
		if (event.type === "user/message") {
			if (!privacy.includeUserText) continue;
			const text = messageText(event).trim();
			if (text.length === 0) continue;
			history.push({
				label: `user t${event.data.turn ?? "?"}`,
				text: truncate$1(text, textBudget)
			});
			continue;
		}
		if (event.type === "assistant/message") {
			if (!privacy.includeAssistantText) continue;
			const text = messageText(event).trim();
			if (text.length === 0) continue;
			history.push({
				label: `assistant t${event.data.turn ?? "?"}`,
				text: truncate$1(text, textBudget)
			});
			continue;
		}
		if (event.type === "tool/call") {
			if (!privacy.includeToolArguments) continue;
			const data = event.data;
			const candidate = candidateByCallId.get(data.callId);
			if (candidate === void 0) continue;
			const args = truncate$1(candidate.toolArgumentsPreview ?? "", config.state.toolInputChars);
			const features = inputs.features.get(data.callId);
			const result = candidate.isError ? "error" : "ok";
			history.push({
				label: `tool t${data.turn}/c${data.callId}`,
				callId: data.callId,
				text: [
					`id=${candidate.callId}`,
					`name=${data.name}`,
					`args=${args || "{}"}`,
					`result=${result}, ${candidate.originalChars} chars omitted`,
					`features=age:${candidate.agePositions}p; ${formatFeatures(features)}`
				].join(" ")
			});
		}
	}
	const state = {
		context: STATE_CONTEXT,
		goal: goalFromSession(session, config),
		history
	};
	return {
		state,
		tokens: estimateStateTokens(JSON.stringify(state))
	};
}
/**
* Progressive fitting (SPEC §19): shrink the state deterministically until it
* fits `maxStateTokens`, oldest-first and metadata-first, never dropping the
* goal. Stages: abridge long texts → drop oldest tool metadata → drop oldest
* assistant entries → keep only the goal and the newest few entries. Throws
* when even the last stage does not fit — the caller fails open.
*/
function fitState(state, maxStateTokens) {
	const sizeOf = (candidate) => estimateStateTokens(JSON.stringify(candidate));
	let current = state;
	if (sizeOf(current) <= maxStateTokens) return {
		state: current,
		tokens: sizeOf(current),
		stage: "full"
	};
	current = {
		...current,
		history: current.history.map((entry) => ({
			...entry,
			text: abridge(entry.text, 400, 150)
		}))
	};
	if (sizeOf(current) <= maxStateTokens) return {
		state: current,
		tokens: sizeOf(current),
		stage: "abridged"
	};
	let history = current.history;
	while (history.length > 0 && sizeOf({
		...current,
		history
	}) > maxStateTokens) {
		const dropIndex = history.findIndex((entry) => entry.callId !== void 0);
		if (dropIndex < 0) break;
		history = history.filter((_, index) => index !== dropIndex);
	}
	current = {
		...current,
		history
	};
	if (sizeOf(current) <= maxStateTokens) return {
		state: current,
		tokens: sizeOf(current),
		stage: "tool-metadata-trimmed"
	};
	while (history.length > 5 && sizeOf({
		...current,
		history
	}) > maxStateTokens) history = history.slice(1);
	current = {
		...current,
		history
	};
	if (sizeOf(current) <= maxStateTokens) return {
		state: current,
		tokens: sizeOf(current),
		stage: "history-trimmed"
	};
	throw new Error("jev-compaction: the Jev state cannot fit within state.maxStateTokens");
}
//#endregion
//#region src/planner/savings.ts
function estimateSavings(items) {
	let original = 0;
	let replacement = 0;
	for (const item of items) {
		if (item.action === "KEEP_FULL") continue;
		original += item.originalChars;
		replacement += item.replacementChars;
	}
	const charsSaved = Math.max(0, original - replacement);
	return {
		charsSaved,
		ratio: original > 0 ? charsSaved / original : 0
	};
}
/**
* The gate passes when either configured threshold is met. Manual runs and
* dry-runs bypass this gate at the caller (the plan is always shown).
*/
function meetsSavingsGate(estimate, config) {
	if (config.pruning.minSavingsChars <= 0 && config.pruning.minSavingsRatio <= 0) return true;
	return estimate.charsSaved >= config.pruning.minSavingsChars || estimate.ratio >= config.pruning.minSavingsRatio;
}
//#endregion
//#region src/planner/plan.ts
/**
* Assemble the plan. Items keep the snapshotted surface order; mutation
* ordering follows that order at apply time (SPEC §16.1).
*/
function buildPlan(surfaceSnapshot, items) {
	return {
		surfaceSnapshot,
		items,
		savings: estimateSavings(items.map((item) => ({
			action: item.action,
			originalChars: item.candidate.originalChars,
			replacementChars: item.replacementChars
		}))),
		mutations: items.filter((item) => item.action !== "KEEP_FULL")
	};
}
/** Seqs the plan intends to replace, in snapshotted surface order. */
function plannedSeqs(plan) {
	return plan.mutations.map((item) => item.candidate.surfaceSeq);
}
//#endregion
//#region src/mutation/render.ts
/** Measure text in Unicode code points (not UTF-16 units). */
function codePointLength(text) {
	return Array.from(text).length;
}
/** Code-point-safe slice. */
function sliceCodePoints(text, start, end) {
	return Array.from(text).slice(start, end).join("");
}
const PRUNED_BY = "[dsh-jev-compaction]";
/**
* KEEP_STUB: a small semantic/replay marker. The original event remains in
* the session log; the marker says exactly that.
*
* When the result had already been reduced by immediate shaping before it was
* persisted (result-shaping SPEC §26), the stub records two extra facts: the
* visible content was a reconstruction, and — when one exists — the reference
* under which the pre-shaping original was archived. The reference is a
* content hash, never a filesystem path, and it is not a capability: nothing
* resolves it without a plugin-side lookup.
*/
function renderStub(candidate, reason) {
	const lines = [
		PRUNED_BY,
		"Historical tool output pruned from active model context.",
		`tool=${candidate.toolName ?? "unknown"}`,
		`originalChars=${candidate.originalChars}`,
		`reason=${reason}`
	];
	if (candidate.alreadyShaped === true) lines.push("previouslyShaped=true");
	if (candidate.archiveRef !== void 0) lines.push(`archivedOriginal=${candidate.archiveRef}`);
	lines.push("The original event remains available in the session log.");
	return lines.join("\n");
}
/**
* KEEP_TRUNCATED: bounded head plus optional tail around a neutral marker.
* Useful for logs and command output where rough identity still matters.
*/
function renderTruncated(originalText, headChars, tailChars) {
	const total = codePointLength(originalText);
	const head = sliceCodePoints(originalText, 0, headChars);
	const tail = tailChars > 0 ? sliceCodePoints(originalText, Math.max(headChars, total - tailChars), total) : "";
	const removed = total - codePointLength(head) - codePointLength(tail);
	if (removed <= 0) return originalText;
	const marker = `\u2026 [${PRUNED_BY} pruned ${removed.toLocaleString("en-US")} historical characters] \u2026`;
	const parts = [];
	if (head.length > 0) parts.push(head);
	parts.push(marker);
	if (tail.length > 0) parts.push(tail);
	return parts.join("\n\n");
}
/** Render the replacement for one action. */
function renderReplacement(candidate, action, headChars, tailChars, reason) {
	if (action === "KEEP_TRUNCATED") return renderTruncated(candidate.originalText, headChars, tailChars);
	return renderStub(candidate, reason);
}
//#endregion
//#region src/mutation/apply.ts
/** Error thrown when the surface drifted while the plan was being produced. */
var SurfaceChangedError = class extends Error {
	constructor() {
		super("jev-compaction: session surface changed while the plan was produced; plan discarded");
		this.name = "SurfaceChangedError";
	}
};
/**
* Validate the plan against the live session and apply it. Throws
* {@link SurfaceChangedError} before the first append when the plan is stale;
* reports partial completion through {@link ApplyOutcome.failure} when a
* later append fails after earlier ones landed.
*/
function applyPlan(session, plan) {
	const planned = plannedSeqs(plan);
	if (!isSnapshotFresh(session, plan.surfaceSnapshot, planned)) throw new SurfaceChangedError();
	const applied = [];
	for (const item of plan.mutations) try {
		const event = session.eventAt(item.candidate.surfaceSeq);
		if (event === void 0 || event.type !== "tool/result") throw new SurfaceChangedError();
		const text = item.replacementText;
		if (text === void 0) throw new TypeError("jev-compaction: mutation item without replacement text");
		const replacementSeq = appendToolResultReplacement(session, event, text);
		applied.push({
			originalSeq: item.candidate.surfaceSeq,
			replacementSeq,
			callId: item.candidate.callId,
			charsBefore: item.candidate.originalChars,
			charsAfter: codePointLength(text)
		});
	} catch (error) {
		if (error instanceof SurfaceChangedError && applied.length === 0) throw error;
		return {
			applied,
			failure: {
				item,
				error
			}
		};
	}
	return { applied };
}
//#endregion
//#region src/result-shaping/reconstruct.ts
/** Every marker this plugin writes into shaped output starts with this. */
const SHAPING_MARKER_PREFIX = "[dsh-jev-compaction:";
/** Detects a result this plugin has already shaped (idempotence, §26). */
function isShapedText(text) {
	return text.includes(SHAPING_MARKER_PREFIX);
}
const ARCHIVE_REFERENCE_PATTERN = /\[dsh-jev-compaction: original archived as (sha256:[0-9a-f]+)\]/u;
/** The archive reference recorded in a previously shaped result, if any. */
function readArchiveRef(text) {
	return ARCHIVE_REFERENCE_PATTERN.exec(text)?.[1];
}
/** Marker replacing one collapsed run. Factual: it counts, it does not judge. */
function collapseMarker(count) {
	return `${SHAPING_MARKER_PREFIX} collapsed ${count.toLocaleString("en-US")} repetitive lines]`;
}
/** Marker naming the archived original. `ref` is a short `sha256:<hex>` value. */
function archiveMarker(ref) {
	return `${SHAPING_MARKER_PREFIX} original archived as ${ref}]`;
}
/**
* Rebuild the text. Runs must be disjoint and in ascending order — they come
* from `analyzeText`, which guarantees both.
*/
function reconstruct(input) {
	const { lines, collapsed } = input;
	if (collapsed.length === 0) return lines.join("\n");
	const parts = [];
	let cursor = 0;
	for (const run of collapsed) {
		for (; cursor < run.start; cursor += 1) parts.push(lines[cursor]);
		parts.push(collapseMarker(run.count));
		cursor = run.end;
	}
	for (; cursor < lines.length; cursor += 1) parts.push(lines[cursor]);
	if (input.archiveRef !== void 0) parts.push("", archiveMarker(input.archiveRef));
	return parts.join("\n");
}
/** Characters saved by one collapse, counting the marker's own cost. */
function runSavings(lines, run) {
	let original = 0;
	for (let index = run.start; index < run.end; index += 1) original += lines[index].length + 1;
	return original - (collapseMarker(run.count).length + 1);
}
//#endregion
//#region src/planner/collect.ts
function readRawResult(event) {
	if (event.type !== "tool/result") return void 0;
	const data = event.data;
	const normalized = normalizeToolResultMessage(data.message);
	if (normalized === void 0) return void 0;
	return {
		seq: event.seq,
		turn: data.turn,
		step: data.step,
		callId: normalized.callId,
		isError: normalized.isError,
		text: normalized.text,
		textOnly: normalized.textOnly
	};
}
function argumentsPreview$1(info, limit) {
	if (info === void 0 || limit <= 0) return void 0;
	const raw = info.arguments;
	if (typeof raw !== "string" || raw.length === 0) return void 0;
	return raw.length <= limit ? raw : `${raw.slice(0, Math.max(0, limit - 1))}…`;
}
/**
* Collect eligible candidates from one stable surface read.
*
* @param nodeTokens optional per-node heuristic token prices; used to extend
*   the recent pin from the tail by `preserve.recentTokens`.
*/
function collectCandidates(session, config, nodeTokens) {
	const surfaceEvents = readSurfaceEvents(session);
	const callIndex = buildCallIndex(session);
	const positionPinFrom = Math.max(0, surfaceEvents.length - config.preserve.recentMessages);
	let tokenPinFrom = surfaceEvents.length;
	if (nodeTokens !== void 0 && config.preserve.recentTokens > 0) {
		let budget = config.preserve.recentTokens;
		for (let index = surfaceEvents.length - 1; index >= 0; index -= 1) {
			const price = nodeTokens.get(surfaceEvents[index].seq) ?? 0;
			if (budget < price) break;
			budget -= price;
			tokenPinFrom = index;
		}
	}
	const pinFrom = Math.min(positionPinFrom, tokenPinFrom);
	let currentTurn = 0;
	for (const event of surfaceEvents) {
		const turn = event.data.turn;
		if (typeof turn === "number" && turn > currentTurn) currentTurn = turn;
	}
	const candidates = [];
	const total = surfaceEvents.length;
	for (let index = 0; index < total; index += 1) {
		const raw = readRawResult(surfaceEvents[index]);
		if (raw === void 0) continue;
		if (index >= pinFrom) continue;
		if (raw.turn >= currentTurn && currentTurn > 0) continue;
		if (config.preserve.errors && raw.isError) continue;
		if (raw.callId === void 0 || !raw.textOnly) continue;
		if (!callIndex.has(raw.callId)) continue;
		if (raw.text.includes("[dsh-jev-compaction]")) continue;
		const info = callIndex.get(raw.callId);
		const shaped = isShapedText(raw.text);
		const archiveRef = shaped ? readArchiveRef(raw.text) : void 0;
		candidates.push({
			surfaceSeq: raw.seq,
			callId: raw.callId,
			toolName: info.name,
			turn: raw.turn,
			step: raw.step,
			originalText: raw.text,
			originalChars: Array.from(raw.text).length,
			isError: raw.isError,
			agePositions: total - 1 - index,
			toolArgumentsPreview: argumentsPreview$1(info, config.state.toolInputChars),
			...shaped ? { alreadyShaped: true } : {},
			...archiveRef === void 0 ? {} : { archiveRef }
		});
	}
	return {
		candidates,
		callIndex,
		currentTurn
	};
}
//#endregion
//#region src/planner/policy.ts
/**
* Convert validated probabilities into a deterministic action.
*
* - `needContents >= fullThreshold` → full;
* - `needContents >= truncateThreshold` → truncated, unless verbatim is
*   asked and clearly unwanted (`needVerbatim < truncateThreshold`), which
*   downgrades to a stub;
* - otherwise → stub.
*/
function decideAction(scores, config) {
	if (scores.needContents >= config.decisions.fullThreshold) return "KEEP_FULL";
	if (scores.needContents >= config.decisions.truncateThreshold) {
		if (scores.needVerbatim !== void 0 && scores.needVerbatim < config.decisions.truncateThreshold) return "KEEP_STUB";
		return "KEEP_TRUNCATED";
	}
	return "KEEP_STUB";
}
//#endregion
//#region src/observability/logging.ts
/**
* Structured plugin events (SPEC §27). The plugin logger from
* `@yadsh/dsh-plugin-log` stays fail-open and never logs API keys, raw Jev
* state or full tool outputs.
*/
const jevLogger = getPluginLogger({ pluginId: "dsh-jev-compaction" });
/** Structured event names emitted by this plugin. */
const JEV_EVENTS = {
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
	shapingArchiveGc: "jev-compaction/result-shaping-archive-gc"
};
//#endregion
//#region src/commands/jev-compact.ts
/** Plain-language skip reasons for `/jev-compact` operators. */
function explainSkip(reason) {
	switch (reason) {
		case "no-candidates": return [
			"Nothing to trim: no eligible old tool results in this session.",
			"",
			"Jev only shortens stale tool output (shell / search / file reads).",
			"It does not rewrite chat messages. Run more tool-heavy work, then try again."
		].join("\n");
		case "not-enough-candidates": return [
			"Not enough old tool results yet to start pruning.",
			"",
			"A minimum candidate count is required so useful recent output is not removed too early."
		].join("\n");
		case "not-enough-candidate-chars": return [
			"Candidate tool results are still too small to be worth pruning.",
			"",
			"Trimming short output saves little context, so this run was skipped."
		].join("\n");
		case "pressure-not-met": return [
			"Context pressure is still below the trigger threshold.",
			"",
			"The session is not full enough yet. Compaction becomes useful as the context grows."
		].join("\n");
		case "cooldown": return [
			"Compaction ran recently and is still in cooldown.",
			"",
			"Automatic runs wait a few turns between passes to avoid repeated edits."
		].join("\n");
		case "savings-gate": return [
			"Scoring finished, but estimated savings were too small to apply.",
			"",
			"This is intentional: weak savings are skipped to avoid risky edits."
		].join("\n");
		case "empty-plan": return [
			"Candidates were scored, and all of them should stay as-is.",
			"",
			"Nothing was changed because the decision model still needs this tool output."
		].join("\n");
		case "disabled": return "Jev compaction is disabled (enabled: false).";
		case "busy": return [
			"Could not apply right now (busy, cancelled, or the conversation surface just changed).",
			"",
			"Try again shortly. Normal chat is unaffected."
		].join("\n");
		case "jev-failed": return [
			"The decision backend failed, so pruning was skipped (fail-open).",
			"",
			"Chat continues normally. Check the API key, network, and model settings."
		].join("\n");
		default: return [
			"Nothing to do this time.",
			"",
			"Jev only trims stale tool output; it does not summarize the conversation itself."
		].join("\n");
	}
}
function formatScores(report) {
	if (report.plan === void 0) return "";
	const stubs = [...report.plan.items].filter((item) => item.action === "KEEP_STUB" && item.scores !== void 0).sort((a, b) => (a.scores?.needContents ?? 1) - (b.scores?.needContents ?? 1)).slice(0, 3);
	if (stubs.length === 0) return "";
	return `\nMost likely stub candidates:\n${stubs.map((item) => {
		const label = item.candidate.toolName ?? "unknown";
		const args = item.candidate.toolArgumentsPreview?.replace(/\s+/g, " ").slice(0, 40) ?? "";
		const score = (item.scores?.needContents ?? 0).toFixed(2);
		return `- ${label}${args.length > 0 ? ` ${args}` : ""}  ${score}`;
	}).join("\n")}`;
}
function formatPlanCounts(plan) {
	const keptFull = plan.items.filter((item) => item.action === "KEEP_FULL").length;
	const truncated = plan.items.filter((item) => item.action === "KEEP_TRUNCATED").length;
	const stubbed = plan.items.filter((item) => item.action === "KEEP_STUB").length;
	return [
		`Keep full: ${keptFull}`,
		`Truncate: ${truncated}`,
		`Stub: ${stubbed}`
	].join("\n");
}
/**
* The immediate-shaping layer's own counters for the audit output. The two
* layers are reported separately on purpose: one combined "saved" number
* would hide which of them did the work.
*/
function formatShapingStats(stats) {
	const seen = stats.counters["resultShaping.seen"] ?? 0;
	if (seen === 0) return [];
	const shaped = stats.counters["resultShaping.shaped"] ?? 0;
	const saved = stats.counters["resultShaping.savedChars"] ?? 0;
	const lines = [
		"",
		"Immediate result shaping (this process):",
		`  seen ${seen}, eligible ${stats.counters["resultShaping.eligible"] ?? 0}, shaped ${shaped}`,
		`  saved ${saved.toLocaleString("en-US")} chars`
	];
	const reasons = Object.entries(stats.skipReasons).sort((left, right) => right[1] - left[1]).slice(0, 4);
	if (reasons.length > 0) lines.push(`  skipped: ${reasons.map(([reason, count]) => `${reason}=${count}`).join(" ")}`);
	return lines;
}
function renderReport(report, includeScores, shaping) {
	if (report.skipped !== void 0 && report.plan === void 0) return `Jev compaction\n\n${explainSkip(report.skipped)}`;
	const lines = [report.mode === "dry-run" ? "Jev compaction dry-run" : "Jev compaction completed", ""];
	if (report.plan !== void 0) {
		lines.push(`Candidates: ${report.candidates}`, formatPlanCounts(report.plan), "", `Estimated visible text reduction: ${report.plan.savings.charsSaved.toLocaleString("en-US")} chars`);
		if (report.tokensBefore !== void 0 && report.tokensAfter !== void 0) {
			const saved = report.tokensBefore - report.tokensAfter;
			const percent = report.tokensBefore > 0 ? ` (${(saved / report.tokensBefore * 100).toFixed(1)}%)` : "";
			lines.push(`Estimated token reduction: ${saved.toLocaleString("en-US")}${percent}`);
		}
		if (includeScores) lines.push(formatScores(report));
		if (report.mode === "dry-run") {
			if (shaping !== void 0) lines.push(...formatShapingStats(shaping));
			lines.push("", "Preview only — no session changes were made.");
			return lines.join("\n");
		}
		if (report.queuedForNextStep === true) lines.push("", "Queued: applied before the next model step,", "when tool-result replacements are safe.", "The plan is recomputed then and dropped if the surface changed.");
		return lines.join("\n");
	}
	if (report.applied.length > 0) {
		const before = report.tokensBefore ?? 0;
		const after = report.tokensAfter ?? before;
		const saved = Math.max(0, before - after);
		const percent = before > 0 ? ` (${(saved / before * 100).toFixed(1)}%)` : "";
		lines.push(`Before: ${before.toLocaleString("en-US")} estimated tokens`, `After: ${after.toLocaleString("en-US")} estimated tokens`, `Saved: ${saved.toLocaleString("en-US")}${percent}`, "", `Candidates: ${report.candidates}`, `Full kept: ${report.keptFull}`, `Truncated: ${report.truncated}`, `Stubbed: ${report.stubbed}`, "", "Applied before this step's model request; the pending queue is now empty.");
		return lines.join("\n");
	}
	return `Jev compaction\n\n${explainSkip(report.skipped)}`;
}
/** Register `/jev-compact` on the host command registry. */
function registerJevCompactCommand(commands, service) {
	return commands.register({
		name: "jev-compact",
		description: "Trim stale tool output to free context (add --dry-run to preview)",
		input: { hint: "[--dry-run]" },
		handler: (invocation) => (async () => {
			const dryRun = /--dry-run/i.test(invocation.rawInput);
			const agent = invocation.agent;
			try {
				const report = await service.runManualDry(agent, invocation.signal);
				if (report.error !== void 0) return {
					kind: "error",
					text: [
						"Jev compaction failed (chat continues; pruning was skipped).",
						"",
						report.error
					].join("\n")
				};
				if (dryRun) return {
					kind: "success",
					text: renderReport(report, true, service.shaping.stats())
				};
				if (report.plan === void 0 || report.plan.mutations.length === 0) return {
					kind: "success",
					text: renderReport(report, true, service.shaping.stats())
				};
				const queued = service.queueManualRun(agent);
				return {
					kind: "success",
					text: renderReport({
						...report,
						mode: "manual",
						queuedForNextStep: queued
					}, true)
				};
			} catch (error) {
				return {
					kind: "error",
					text: [
						"Jev compaction failed (chat continues).",
						"",
						error instanceof Error ? error.message : String(error)
					].join("\n")
				};
			}
		})()
	});
}
//#endregion
//#region src/shared/settings.ts
/**
* The settings namespace, shared by the Host section install and the browser
* card so the two can never drift apart. This module must stay dependency
* free: the card bundle inlines it, and pulling the config schema (and with it
* Schemastery) into the page would bloat the bundle for one string.
*/
/** Settings namespace owning this plugin's user-editable section. */
const JEV_COMPACTION_SETTINGS_NAMESPACE = "jev-compaction";
//#endregion
//#region src/settings/install.ts
/**
* Install the plugin's settings section. Safe when the host exposes no
* settings service (older profiles, headless probes): the plugin keeps
* running on its composition config.
*/
function installJevCompactionSettings(target) {
	target.owner.inject(["settings"], (injected) => {
		const settings = injected.settings;
		if (settings === void 0) return;
		settings.installSection(target.owner, JEV_COMPACTION_SETTINGS_NAMESPACE, target.schema, target.entryConfig, {
			setSource: (current) => {
				target.setSource(current);
			},
			onChange: () => {
				target.onChange();
			},
			...target.validate === void 0 ? {} : { validate: (value) => target.validate?.(value) }
		});
	});
}
//#endregion
//#region src/archive/gc.ts
const KEEP_EVERYTHING = Object.freeze({
	deleted: 0,
	bytesFreed: 0,
	kept: 0,
	errors: 0
});
/**
* Enforce `retentionDays` and `maxBytes`. Both limits default to "no limit"
* when zero, and a zero-byte ceiling is treated as unset rather than as
* "delete everything": a misconfigured retention must never be destructive.
*/
async function collectArchive(archive, config) {
	const { retentionDays, maxBytes } = config.archive;
	if (retentionDays <= 0 && maxBytes <= 0) return KEEP_EVERYTHING;
	const entries = await archive.list();
	if (entries.length === 0) return KEEP_EVERYTHING;
	const cutoff = retentionDays > 0 ? Date.now() - retentionDays * 24 * 60 * 60 * 1e3 : void 0;
	let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
	let deleted = 0;
	let bytesFreed = 0;
	let errors = 0;
	let kept = 0;
	for (const entry of entries) {
		if (!(cutoff !== void 0 && entry.mtimeMs < cutoff) && !(maxBytes > 0 && total > maxBytes)) {
			kept += 1;
			continue;
		}
		try {
			await archive.delete(entry.ref);
			deleted += 1;
			bytesFreed += entry.bytes;
			total -= entry.bytes;
		} catch {
			errors += 1;
		}
	}
	return {
		deleted,
		bytesFreed,
		kept,
		errors
	};
}
//#endregion
//#region src/archive/hash.ts
/**
* Content addressing for archived results (result-shaping SPEC §23).
*
* The hash is taken over a canonical serialization: keys sorted, only
* JSON-representable data. Two runs of the same command that produce the same
* rendered output therefore produce the same ref, which is what makes the
* store deduplicate and what makes an integrity check possible when an entry
* is read back.
*/
/** Deterministic JSON: object keys sorted, arrays left in order. */
function stableStringify(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	const record = value;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
/** `sha256:<hex>` over the canonical form of one archived payload. */
function contentRef(payload) {
	return `sha256:${createHash("sha256").update(stableStringify(payload), "utf8").digest("hex")}`;
}
/** The hex part of a `sha256:<hex>` ref, or the whole string when untyped. */
function refHex(ref) {
	const separator = ref.indexOf(":");
	return separator < 0 ? ref : ref.slice(separator + 1);
}
//#endregion
//#region src/archive/local.ts
/**
* Local content-addressed archive (result-shaping SPEC §23-§24).
*
* Layout, one JSON file per distinct payload:
*
*   <root>/sha256-<hex>.json
*
* Writes are atomic (temp file + rename) and bounded in size; reads verify the
* hash, so a truncated or edited entry is reported as absent rather than
* returned as truth. Nothing here decides *whether* to archive — that is the
* pipeline's policy — and nothing here ever blocks on a large directory scan:
* retention runs through the GC module, lazily.
*/
/** Default subdirectory under the harness home (SPEC §23). */
const ARCHIVE_HOME_SEGMENTS = Object.freeze([
	"data",
	"dsh-jev-compaction",
	"originals"
]);
/** Largest entry the archive will store; bigger originals are not archived. */
const MAX_ARCHIVE_ENTRY_BYTES = 67108864;
/** Resolve the archive root: explicit config first, harness home otherwise. */
function resolveArchiveRoot(config) {
	const configured = config.archive.rootPath.trim();
	if (configured.length > 0) return configured;
	return dshHomePath(...ARCHIVE_HOME_SEGMENTS);
}
/** One stored entry file. */
function entryPath(root, ref) {
	return join(root, `sha256-${refHex(ref)}.json`);
}
/** The local filesystem archive. */
var LocalResultArchive = class {
	root;
	constructor(root) {
		this.root = root;
	}
	async put(entry, _options) {
		const serialized = JSON.stringify(entry);
		const bytes = Buffer.byteLength(serialized, "utf8");
		if (bytes > 67108864) throw new Error(`archive entry of ${bytes} bytes exceeds the ${MAX_ARCHIVE_ENTRY_BYTES}-byte limit`);
		const path = entryPath(this.root, entry.contentHash);
		if (await this.exists(path)) return entry.contentHash;
		await mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
		await writeFile(temporary, serialized, "utf8");
		await rename(temporary, path);
		return entry.contentHash;
	}
	async get(ref) {
		try {
			const raw = await readFile(entryPath(this.root, ref), "utf8");
			const parsed = JSON.parse(raw);
			if (parsed.version !== 1 || typeof parsed.content !== "object") return null;
			if (contentRef(parsed.content) !== parsed.contentHash) return null;
			return parsed;
		} catch {
			return null;
		}
	}
	async delete(ref) {
		await unlink(entryPath(this.root, ref)).catch(() => void 0);
	}
	/** Names of every stored entry, oldest first by file mtime. */
	async list() {
		let names;
		try {
			names = await readdir(this.root);
		} catch {
			return [];
		}
		const entries = [];
		for (const name of names) {
			const match = /^sha256-([0-9a-f]{64})\.json$/u.exec(name);
			if (match === null) continue;
			const path = join(this.root, name);
			try {
				const info = await stat(path);
				if (!info.isFile()) continue;
				entries.push({
					ref: `sha256:${match[1]}`,
					path,
					bytes: info.size,
					mtimeMs: info.mtimeMs
				});
			} catch {}
		}
		entries.sort((left, right) => left.mtimeMs - right.mtimeMs);
		return entries;
	}
	async exists(path) {
		try {
			return (await stat(path)).isFile();
		} catch {
			return false;
		}
	}
};
/**
* The turn number of the newest logged event, read from the end of the log so
* the usual case is a couple of iterations.
*/
function latestTurn(session) {
	const events = session.snapshotEvents();
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const turn = events[index].data.turn;
		if (typeof turn === "number" && Number.isFinite(turn)) return turn;
	}
}
var TurnShapeBudget = class {
	usage = /* @__PURE__ */ new Map();
	/**
	* Reserve budget for one shaping request. Returns false when the turn has
	* already spent `maxPerTurn` requests or `maxInputCharsPerTurn` characters —
	* in which case the result is kept as it is.
	*/
	tryConsume(sessionId, turn, chars, config) {
		const shaping = config.resultShaping;
		if (shaping.maxPerTurn <= 0) return false;
		const key = sessionId.length > 0 ? sessionId : "(unknown)";
		const effectiveTurn = turn ?? this.usage.get(key)?.turn ?? 0;
		let entry = this.usage.get(key);
		if (entry === void 0 || entry.turn !== effectiveTurn) {
			entry = {
				turn: effectiveTurn,
				requests: 0,
				chars: 0
			};
			this.usage.set(key, entry);
		}
		const nextChars = entry.chars + chars;
		if (entry.requests >= shaping.maxPerTurn) return false;
		if (shaping.maxInputCharsPerTurn > 0 && nextChars > shaping.maxInputCharsPerTurn) return false;
		entry.requests += 1;
		entry.chars = nextChars;
		this.prune();
		return true;
	}
	/** Forget the usage of every session whose turn has moved on. */
	forget(sessionId) {
		this.usage.delete(sessionId);
	}
	reset() {
		this.usage.clear();
	}
	/** Bound the map: evict the least recently inserted session past the cap. */
	prune() {
		if (this.usage.size <= 64) return;
		const excess = this.usage.size - 64;
		let removed = 0;
		for (const key of this.usage.keys()) {
			this.usage.delete(key);
			removed += 1;
			if (removed >= excess) break;
		}
	}
};
//#endregion
//#region src/result-shaping/hook.ts
/** Initial decision of a tool call this plugin runs itself (future tools). */
const OWN_TOOL_PREFIX = "jev_compaction";
function createPostExecuteListener(options) {
	const { shaper, readConfig, reserveBudget, goalFor, onSkip } = options;
	return async (exec, result, next) => {
		const downstream = await next();
		try {
			if (downstream.kind !== "accept") {
				onSkip("downstream-block", { tool: exec.name });
				return downstream;
			}
			if ("value" in downstream && downstream.value !== void 0) {
				onSkip("downstream-value-replacement", { tool: exec.name });
				return downstream;
			}
			const config = readConfig();
			if (!config.resultShaping.enabled) return downstream;
			if (exec.parent !== void 0) {
				onSkip("nested-dispatch", { tool: exec.name });
				return downstream;
			}
			if (exec.name.startsWith(OWN_TOOL_PREFIX)) {
				onSkip("own-result", { tool: exec.name });
				return downstream;
			}
			const content = downstream.content ?? result.content;
			const session = exec.agent?.session;
			const sessionId = session === void 0 ? void 0 : String(session.header.id);
			const outcome = await shaper.maybeShape({
				callId: String(exec.callId),
				toolName: exec.name,
				...sessionId === void 0 ? {} : { sessionId },
				isError: result.isError,
				content,
				argumentsPreview: argumentsPreview(exec.arguments, config),
				goal: goalFor(exec),
				signal: exec.signal,
				reserve: (chars) => reserveBudget(exec, chars)
			});
			if (outcome === void 0) return downstream;
			return {
				...downstream,
				content: outcome.content
			};
		} catch (error) {
			onSkip("jev-error", {
				tool: exec.name,
				error: error instanceof Error ? error.message : String(error)
			});
			return downstream;
		}
	};
}
/** Bounded tool-argument preview for the classifier's state. */
function argumentsPreview(args, config) {
	const limit = config.state.toolInputChars;
	if (limit <= 0) return void 0;
	const serialized = typeof args === "string" ? args : JSON.stringify(args ?? null);
	if (serialized === void 0 || serialized === null) return void 0;
	return serialized.length <= limit ? serialized : `${serialized.slice(0, Math.max(0, limit - 1))}\u2026`;
}
//#endregion
//#region src/result-shaping/metrics.ts
/** Mutable counter set; one instance per plugin process. */
var ShapingMetrics = class {
	counts = /* @__PURE__ */ new Map();
	totals = /* @__PURE__ */ new Map();
	increment(name, by = 1) {
		this.counts.set(name, (this.counts.get(name) ?? 0) + by);
	}
	add(name, by) {
		this.totals.set(name, (this.totals.get(name) ?? 0) + by);
	}
	count(name) {
		return this.counts.get(name) ?? 0;
	}
	total(name) {
		return this.totals.get(name) ?? 0;
	}
	/** Flat, JSON-safe snapshot for logs and diagnostics. */
	snapshot() {
		const snapshot = {};
		for (const [name, value] of this.counts) snapshot[name] = value;
		for (const [name, value] of this.totals) snapshot[name] = value;
		return snapshot;
	}
	reset() {
		this.counts.clear();
		this.totals.clear();
	}
};
/** Metric names, spelled once so the logs and the tests cannot drift. */
const SHAPE_METRICS = {
	seen: "resultShaping.seen",
	eligible: "resultShaping.eligible",
	skipped: "resultShaping.skipped",
	requests: "resultShaping.requests",
	shaped: "resultShaping.shaped",
	keptOriginal: "resultShaping.keptOriginal",
	errors: "resultShaping.errors",
	timeouts: "resultShaping.timeouts",
	archiveWrites: "resultShaping.archiveWrites",
	archiveFailures: "resultShaping.archiveFailures",
	originalChars: "resultShaping.originalChars",
	persistedChars: "resultShaping.persistedChars",
	savedChars: "resultShaping.savedChars",
	jevInputEstimate: "resultShaping.jevInputEstimate",
	latencyMs: "resultShaping.latencyMs",
	jevLatencyMs: "resultShaping.jevLatencyMs",
	collapsedLines: "resultShaping.collapsedLines"
};
//#endregion
//#region src/archive/types.ts
/** Short form for model-visible markers: `sha256:0123456789ab`. */
function shortRef(ref, hexChars = 12) {
	const separator = ref.indexOf(":");
	if (separator < 0) return ref.slice(0, hexChars);
	return `${ref.slice(0, separator + 1)}${ref.slice(separator + 1, separator + 1 + hexChars)}`;
}
//#endregion
//#region src/result-shaping/normalize.ts
/**
* Line-shape normalization (result-shaping SPEC §16).
*
* Two lines share a shape when they differ only in volatile values. The shape
* is used for *clustering only* — it never reaches the model — so the bar for
* collapsing two lines is low, while the bar for erasing a value that could be
* evidence is high.
*
* Replaced (values vary between runs, carry no decision-relevant meaning):
*   ANSI escape sequences, ISO-8601 and clock timestamps, UUIDs, long hex
*   hashes, percentages, and standalone counters of any width (`test 81`,
*   `pkg-12`, `progress 1%`).
*
* Protected, and therefore part of the shape (each may be exactly what the
* next decision needs): line and column positions, dotted versions and file
* names, HTTP status codes, exit codes, and any identifier a digit is glued
* to. Protected spans are lifted out before the counter rule runs and put back
* afterwards, so the exclusions are explicit rather than an accident of a
* lookaround.
*/
/**
* CSI/OSC escape sequences emitted by colorized tools. Built from a raw
* template so the escape characters stay spelled `\x1b` in the source instead
* of appearing as literal control characters.
*/
const ANSI_PATTERN = new RegExp(String.raw`\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)`, "gu");
/** ISO-8601 date-times, with or without a zone. */
const ISO_TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/gu;
/** Bare clock times as log prefixes emit them: 12:01:04.512, 9:30. */
const CLOCK_PATTERN = /(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?(?![\d:])/gu;
/** Canonical UUIDs. */
const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/gu;
/** Long hex digests (short hashes stay: they are often referenced later). */
const LONG_HASH_PATTERN = /\b[0-9a-fA-F]{16,}\b/gu;
/** Percentages, including decimal ones: 12%, 99.5 %. */
const PERCENT_PATTERN = /\b\d+(?:[.,]\d+)?\s?%/gu;
/**
* Standalone integer runs. The lookarounds keep a digit glued to a path
* separator, a dot or a word character inside its token: `app.ts:123:45`,
* `v20.11.1`, `report-2026.json` and `5b54e83` are all left intact.
*/
const COUNTER_PATTERN = /(?<![\w.:])\d+(?![\w.])/gu;
/**
* Spans that must survive normalization, tried left to right:
*
* - a `file.ts:123:45` position (line and column are evidence a diagnostic is
*   read against);
* - a protocol verb, a path and an HTTP status code;
* - an exit or status code spelled out after `code`, `status` or `exit`.
*
* Everything else relies on the counter rule's lookarounds, which keep digits
* glued to a path separator, a dot or a letter inside their own token.
*/
const PROTECTED_PATTERNS = Object.freeze([
	/\b[\w./\\-]+\.\w+:\d+(?::\d+)?/gu,
	/\b(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S+\s+\d{3}\b/gu,
	/\b(?:exit|code|status)\s+\d+\b/giu
]);
/**
* Placeholder for one protected span. The key is spelled with a letter so the
* counter rule cannot reach the digits inside it — a numeric key would be
* normalized away before the restoration pass ever ran.
*/
function placeholder(index) {
	return `\u0000P${index}\u0000`;
}
/** Lift protected spans out of the line, replacing each with a placeholder. */
function protect(line) {
	const spans = [];
	let text = line;
	for (const pattern of PROTECTED_PATTERNS) text = text.replace(pattern, (match) => {
		spans.push(match);
		return placeholder(spans.length - 1);
	});
	return {
		text,
		spans
	};
}
/**
* Placeholder pattern and the final safety net. Both are built from raw
* templates so the NUL delimiter stays spelled `\u0000` in the source rather
* than appearing as a literal control character.
*/
const PLACEHOLDER_PATTERN = new RegExp(String.raw`\u0000P(\d+)\u0000`, "gu");
const PLACEHOLDER_LEFTOVER = new RegExp(String.raw`\u0000[^\u0000]*\u0000`, "gu");
function restore(text, spans) {
	return text.replace(PLACEHOLDER_PATTERN, (_match, index) => {
		return spans[Number(index)] ?? "";
	}).replace(PLACEHOLDER_LEFTOVER, "");
}
/**
* Collapse whitespace runs so indentation does not split a shape.
*/
const WHITESPACE_PATTERN = /\s+/gu;
/**
* Reduce one line to its shape key. The result is a cluster key, never output:
* it is compared, counted and discarded.
*/
function lineShape(line) {
	const { text, spans } = protect(line.replace(ANSI_PATTERN, ""));
	return restore(text.replace(ISO_TIMESTAMP_PATTERN, "<time>").replace(UUID_PATTERN, "<uuid>").replace(LONG_HASH_PATTERN, "<hash>").replace(CLOCK_PATTERN, "<time>").replace(PERCENT_PATTERN, "<percent>").replace(COUNTER_PATTERN, "<number>"), spans).replace(WHITESPACE_PATTERN, " ").trim();
}
/** True for a line that carries no content (blank or whitespace only). */
function isBlank(line) {
	return line.trim().length === 0;
}
//#endregion
//#region src/result-shaping/pins.ts
/**
* Deterministic pins (result-shaping SPEC §17).
*
* A pin is a line that must survive shaping no matter what the classifier
* says: the head and the tail of the output, and every line that looks like a
* conclusion, a failure, or a diagnostic. Pins are heuristic aids, not a
* guarantee — the classifier is the second signal, and the savings gate is the
* third.
*
* A pinned line splits a repeated run, so a block of progress lines with an
* error in the middle collapses on both sides of the error and never across
* it.
*/
/**
* Conclusion, failure and diagnostic markers. Every entry is a phrase a tool
* emits to say "this is the outcome" — the part a next-step decision usually
* needs verbatim.
*/
const IMPORTANT_PATTERNS = Object.freeze([
	/\b(?:error|errors|fail(?:ed|ure|ures|ing)?|fatal|panic|exception|abort(?:ed)?|denied|refused|timeout|timed out)\b/iu,
	/\b(?:warn(?:ing|ings)?|deprecat(?:ed|ion))\b/iu,
	/\b(?:assert(?:ion)?(?:error)?|expected|actual|received)\b/iu,
	/^\s+at\s+\S/u,
	/\bCaused by\b/u,
	/\bTraceback\b/u,
	/\b(?:error|warning)\s+[A-Z]{1,5}\d{2,6}\b/u,
	/\b\d+\s+(?:errors?|warnings?|failures?)\b/iu,
	/\b\d+\s+(?:passed|failed|skipped|pending|failing|passing)\b/iu,
	/\b(?:tests?|suites?|specs?)\b[\s\S]{0,24}\b(?:passed|failed|ran)\b/iu,
	/\bexit(?:ed|ing)?\b[^\n]{0,16}\b(?:code|status)\b/iu,
	/\bexit\s+\d+\b/iu,
	/\bcommand\s+(?:not\s+found|failed)\b/iu,
	/^(?:added|removed|changed|updated|installed|audited|built|compiled|finished|done)\b/iu,
	/\bpackages?\s+in\s+\d/iu,
	/^(?:\+\+\+|---)\s\S/u,
	/^@@\s/u
]);
/**
* Indices that must never be collapsed: the configured head and tail, and any
* line matching an importance marker. Blank lines are pinned too — they are
* cheap and they carry the output's own segmentation.
*/
function pinnedLines(lines, keepHeadLines, keepTailLines) {
	const pinned = /* @__PURE__ */ new Set();
	const head = Math.max(0, keepHeadLines);
	const tail = Math.max(0, keepTailLines);
	for (let index = 0; index < Math.min(head, lines.length); index += 1) pinned.add(index);
	for (let index = Math.max(0, lines.length - tail); index < lines.length; index += 1) pinned.add(index);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (isBlank(line) || matchesImportant(line)) pinned.add(index);
	}
	return pinned;
}
/** True when a line carries a conclusion, failure or diagnostic marker. */
function matchesImportant(line) {
	for (const pattern of IMPORTANT_PATTERNS) if (pattern.test(line)) return true;
	return false;
}
//#endregion
//#region src/result-shaping/cluster.ts
/**
* Analysis of a result's text into collapsible runs (result-shaping SPEC §15,
* §16).
*
* Only *contiguous* lines that share a shape are ever grouped, which is what
* keeps reconstruction trivially order-preserving: the shaped output is the
* original line sequence with each collapsed run replaced in place. Scattered
* identical lines are never merged, because merging them would move evidence
* away from the context that explains it.
*/
/** Split text into lines, dropping a single trailing newline artifact. */
function splitLines(text) {
	const lines = text.split(/\r?\n/u);
	if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}
/**
* Analyze text: shapes, pins, and the maximal runs of adjacent same-shape
* lines that may collapse.
*/
function analyzeText(text, options) {
	const lines = splitLines(text);
	const shapes = lines.map((line) => lineShape(line));
	const pinned = pinnedLines(lines, options.keepHeadLines, options.keepTailLines);
	const runs = [];
	let collapsedLines = 0;
	let nonBlank = 0;
	for (let index = 0; index < lines.length; index += 1) if (!isBlank(lines[index])) nonBlank += 1;
	let cursor = 0;
	while (cursor < lines.length) {
		const shape = shapes[cursor];
		if (isBlank(lines[cursor]) || pinned.has(cursor) || shape.length === 0) {
			cursor += 1;
			continue;
		}
		let end = cursor + 1;
		while (end < lines.length && !isBlank(lines[end]) && !pinned.has(end) && shapes[end] === shape) end += 1;
		const count = end - cursor;
		if (count >= Math.max(2, options.minRunLines)) {
			runs.push({
				start: cursor,
				end,
				count,
				shape,
				sample: lines[cursor]
			});
			collapsedLines += count;
		}
		cursor = end;
	}
	return {
		lines,
		shapes,
		pinned,
		runs,
		repetitionRatio: nonBlank === 0 ? 0 : collapsedLines / nonBlank
	};
}
//#endregion
//#region src/result-shaping/eligibility.ts
/**
* Markers left by DSH's own result-bounding layers. Shaping after one of them
* would fight the built-in behaviour and could rewrite its locator into a
* normal-looking preview (SPEC §27).
*/
const FOREIGN_MARKERS = Object.freeze([
	"Full formatted result stored at:",
	"[... tool result middle pruned ...]",
	PRUNED_BY
]);
/** True when the tool may be shaped: in the allowlist, not in the denylist. */
function isToolEligible(toolName, config) {
	const shaping = config.resultShaping;
	if (shaping.excludeTools.includes(toolName)) return false;
	return shaping.includeTools.includes(toolName);
}
/** True when the text already carries somebody's bounding marker. */
function carriesForeignMarker(text) {
	return FOREIGN_MARKERS.some((marker) => text.includes(marker));
}
/**
* Apply the candidate rules in order: enabled, tool allowed, successful
* result, shapeable text, size and shape trigger, not already bounded. The
* per-turn budget is checked by the caller, which owns the turn counter.
*/
function evaluateTrigger(input, config) {
	const shaping = config.resultShaping;
	if (!shaping.enabled) return {
		eligible: false,
		reason: "disabled"
	};
	if (!isToolEligible(input.toolName, config)) return {
		eligible: false,
		reason: "tool-not-allowed"
	};
	if (input.isError && shaping.preserveErrors) return {
		eligible: false,
		reason: "error-result"
	};
	const length = input.text.length;
	if (length === 0) return {
		eligible: false,
		reason: "empty-content"
	};
	if (isShapedText(input.text)) return {
		eligible: false,
		reason: "already-shaped"
	};
	if (carriesForeignMarker(input.text)) return {
		eligible: false,
		reason: "already-spilled"
	};
	if (length < shaping.thresholdChars) return {
		eligible: false,
		reason: "too-small"
	};
	if (!(input.lineCount >= shaping.minLines || input.repetitionRatio >= shaping.repetitionTriggerRatio || length >= shaping.hardLengthTriggerChars)) return {
		eligible: false,
		reason: "not-repetitive"
	};
	return { eligible: true };
}
//#endregion
//#region src/result-shaping/policy.ts
function trusted(value) {
	return value !== void 0 && Number.isFinite(value) && value >= 0 && value <= 1;
}
/**
* Collapse only on a decisive pair. `needed` must be at most `1 - confidence`,
* so the two answers cannot both lean the same way and still authorize a drop.
*/
function decideRun(scores, minConfidence) {
	const { routine, needed } = scores;
	if (routine === void 0 && needed === void 0) return {
		decision: "keep",
		reason: "missing-answer"
	};
	if (!trusted(routine) || !trusted(needed)) return {
		decision: "keep",
		reason: "invalid-answer"
	};
	const required = Math.min(Math.max(minConfidence, .5), 1);
	if (routine >= required && needed <= 1 - required) return {
		decision: "collapse",
		reason: "routine"
	};
	return {
		decision: "keep",
		reason: needed >= required ? "needed" : "low-confidence"
	};
}
//#endregion
//#region src/result-shaping/questions.ts
/** Context paragraph sent with every shaping request. */
const SHAPING_CONTEXT = "A tool call has just finished and its output is about to be added to the conversation. Some blocks of the output repeat a single line shape many times (progress bars, per-item chatter, per-test pass lines). Each question names one such block and asks whether it is routine repetition and whether dropping it would change the assistant's next decision. Blocks that carry outcomes, failures, warnings or unique evidence must be kept; the original output is not recoverable afterwards unless archived.";
/** Question-name prefix for the "is this routine repetition" question. */
const ROUTINE_PREFIX = "routine_l";
/** Question-name prefix for the "would dropping it hurt" question. */
const NEEDED_PREFIX = "needed_l";
function truncate(text, limit) {
	if (limit <= 0) return "";
	return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}\u2026`;
}
/** Stable question id for one run (its first line index). */
function runId(run) {
	return `l${run.start}`;
}
/** The state sent with a shaping request (bounded, deterministic). */
function buildShapingState(input) {
	const args = input.argumentsPreview === void 0 || input.argumentsPreview.length === 0 ? "(none)" : truncate(input.argumentsPreview, 400);
	const history = [{
		label: `tool ${input.toolName}`,
		text: `arguments: ${args}\nresult: ${input.totalChars} chars over ${input.totalLines} lines\nrepeated blocks:\n` + input.runs.map((run) => `  ${runId(run)}: ${run.count} adjacent lines, first at line ${run.start + 1}`).join("\n")
	}];
	return {
		context: SHAPING_CONTEXT,
		goal: input.goal,
		history
	};
}
/**
* Two yes/no questions per run: is this block routine repetition, and would
* removing it materially reduce the ability to make the correct next
* decision. The local policy turns the pair into one decision (§19).
*/
function buildRunQuestions(runs, sampleChars) {
	const questions = [];
	for (const run of runs) {
		const id = runId(run);
		const sample = truncate(run.sample, sampleChars);
		questions.push({
			name: `${ROUTINE_PREFIX}${id}`,
			instructions: `Is this block of tool output routine repetition, where the ${run.count} adjacent lines below share one shape and differ only in values such as timestamps, counters, percentages or hashes, so that reading one of them carries everything the others say?
---\n${sample}\n---`
		});
		questions.push({
			name: `${NEEDED_PREFIX}${id}`,
			instructions: `Would removing this block of output materially reduce the assistant's ability to make the correct next decision about the user's current task?
---\n${sample}\n---`
		});
	}
	return questions;
}
/**
* Split runs into request-sized chunks: each request repeats the state, so a
* chunk's questions must fit `maxRequestTokens` minus the state's own size. A
* run whose questions cannot fit even alone is dropped from the request list
* and therefore kept — the cap bounds cost, it never licenses a drop.
*/
function batchRuns(runs, state, sampleChars, maxRequestTokens) {
	const stateTokens = estimateStateTokens(JSON.stringify(state));
	const batches = [];
	let current = [];
	let currentTokens = stateTokens;
	for (const run of runs) {
		const cost = estimateStateTokens(JSON.stringify(buildRunQuestions([run], sampleChars)));
		if (current.length > 0 && currentTokens + cost > maxRequestTokens) {
			batches.push(current);
			current = [];
			currentTokens = stateTokens;
		}
		if (stateTokens + cost > maxRequestTokens) continue;
		current.push(run);
		currentTokens += cost;
	}
	if (current.length > 0) batches.push(current);
	return batches;
}
//#endregion
//#region src/result-shaping/text.ts
function isTextBlock(block) {
	return block.type === "text" && typeof block.text === "string";
}
/**
* Extract the model-facing text of a result, or `undefined` when the result is
* not shapeable at all (no text, or an ambiguous mix of text and non-text).
*/
function extractText(content) {
	const textIndices = [];
	for (let index = 0; index < content.length; index += 1) if (isTextBlock(content[index])) textIndices.push(index);
	if (textIndices.length === 0) return void 0;
	const text = textIndices.map((index) => content[index].text).join("\n");
	if (textIndices.length === content.length) return {
		text,
		layout: "uniform"
	};
	if (textIndices.length === 1) return {
		text,
		layout: "single"
	};
}
/**
* Rebuild the content array with `replacement` in the text position(s) the
* layout allows. Returns a new array; the input is never mutated.
*/
function replaceText(content, extracted, replacement) {
	if (extracted.layout === "single") return content.map((block) => isTextBlock(block) ? {
		...block,
		text: replacement
	} : block);
	const rebuilt = [];
	let placed = false;
	for (const block of content) {
		if (!isTextBlock(block)) continue;
		if (!placed) {
			rebuilt.push({
				type: "text",
				text: replacement
			});
			placed = true;
		}
	}
	return rebuilt;
}
//#endregion
//#region src/result-shaping/shaper.ts
/**
* Combine the caller's cancellation with the shaper's own request deadline.
* The deadline bounds the critical path even when the transport's own timeout
* is misconfigured high.
*/
function withDeadline(signal, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error("shaping request timed out")), timeoutMs);
	const onAbort = () => controller.abort(signal?.reason);
	if (signal !== void 0) {
		if (signal.aborted) controller.abort(signal.reason);
		else signal.addEventListener("abort", onAbort, { once: true });
	}
	return {
		signal: controller.signal,
		dispose: () => {
			clearTimeout(timer);
			if (signal !== void 0) signal.removeEventListener("abort", onAbort);
		}
	};
}
function isTimeout(error) {
	const message = error instanceof Error ? error.message : String(error);
	return /timed out|abort|cancel/i.test(message);
}
var ImmediateResultShaper = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/**
	* Run the pipeline for one result. Returns `undefined` when the result must
	* be kept exactly as it is, which is the answer for every failure mode.
	*/
	async maybeShape(input) {
		const config = this.deps.readConfig();
		const metrics = this.deps.metrics;
		metrics.increment(SHAPE_METRICS.seen);
		const skip = (reason) => {
			metrics.increment(SHAPE_METRICS.skipped);
			metrics.increment(`${SHAPE_METRICS.skipped}.${reason}`);
			this.deps.onSkip(reason, {
				tool: input.toolName,
				callId: input.callId
			});
		};
		const extracted = extractText(input.content);
		if (extracted === void 0) return skip("unsupported-content");
		const analysis = analyzeText(extracted.text, {
			minRunLines: config.resultShaping.minRunLines,
			keepHeadLines: config.resultShaping.keepHeadLines,
			keepTailLines: config.resultShaping.keepTailLines
		});
		const verdict = evaluateTrigger({
			toolName: input.toolName,
			isError: input.isError,
			text: extracted.text,
			lineCount: analysis.lines.length,
			repetitionRatio: analysis.repetitionRatio
		}, config);
		if (!verdict.eligible) return skip(verdict.reason);
		if (analysis.runs.length === 0) return skip("not-repetitive");
		metrics.increment(SHAPE_METRICS.eligible);
		if (input.reserve !== void 0 && !input.reserve(extracted.text.length)) return skip("turn-budget");
		metrics.add(SHAPE_METRICS.originalChars, extracted.text.length);
		const collapsed = await this.classify(input, config, analysis.runs, extracted.text.length, analysis.lines.length);
		if (collapsed === void 0) return skip("jev-error");
		const accepted = [];
		let sawLowConfidence = false;
		for (const run of analysis.runs) {
			const runVerdict = decideRun(collapsed.get(runId(run)) ?? {}, config.resultShaping.minClassificationConfidence);
			if (runVerdict.decision === "collapse") accepted.push(run);
			else if (runVerdict.reason === "low-confidence") sawLowConfidence = true;
		}
		if (accepted.length === 0) {
			metrics.increment(SHAPE_METRICS.keptOriginal);
			return skip(sawLowConfidence ? "low-confidence" : "not-repetitive");
		}
		const savedByRuns = accepted.reduce((sum, run) => sum + runSavings(analysis.lines, run), 0);
		const savedRatio = savedByRuns / extracted.text.length;
		const savings = config.resultShaping;
		if (!(savings.minSavingsChars <= 0 && savings.minSavingsRatio <= 0 || savedByRuns >= savings.minSavingsChars || savedRatio >= savings.minSavingsRatio)) {
			metrics.increment(SHAPE_METRICS.keptOriginal);
			return skip("low-savings");
		}
		const archiveRef = await this.archive(input, config, extracted.text);
		if (archiveRef === "blocked") {
			metrics.increment(SHAPE_METRICS.keptOriginal);
			return skip("archive-error");
		}
		const text = reconstruct({
			lines: analysis.lines,
			collapsed: accepted,
			...archiveRef === void 0 ? {} : { archiveRef }
		});
		const collapsedLines = accepted.reduce((sum, run) => sum + run.count, 0);
		metrics.increment(SHAPE_METRICS.shaped);
		metrics.add(SHAPE_METRICS.persistedChars, text.length);
		metrics.add(SHAPE_METRICS.savedChars, extracted.text.length - text.length);
		metrics.add(SHAPE_METRICS.collapsedLines, collapsedLines);
		this.deps.onShaped({
			tool: input.toolName,
			callId: input.callId,
			runs: accepted.length,
			lines: collapsedLines,
			originalChars: extracted.text.length,
			shapedChars: text.length,
			archiveRef
		});
		return {
			content: replaceText(input.content, extracted, text),
			originalChars: extracted.text.length,
			shapedChars: text.length,
			savedChars: extracted.text.length - text.length,
			collapsedRuns: accepted.length,
			collapsedLines,
			...archiveRef === void 0 ? {} : { archiveRef },
			jevRequests: collapsed.jevRequests
		};
	}
	/**
	* Ask the classifier about every run. `undefined` means the request failed,
	* which keeps the whole result — a transport error is never a reason to
	* delete output.
	*/
	async classify(input, config, runs, totalChars, totalLines) {
		const metrics = this.deps.metrics;
		const shaping = config.resultShaping;
		const state = buildShapingState({
			toolName: input.toolName,
			...input.argumentsPreview === void 0 ? {} : { argumentsPreview: input.argumentsPreview },
			goal: input.goal,
			totalChars,
			totalLines,
			runs,
			sampleChars: config.state.resultPreviewChars
		});
		const batches = batchRuns(runs, state, config.state.resultPreviewChars, config.state.maxRequestTokens);
		const scores = /* @__PURE__ */ new Map();
		let jevRequests = 0;
		for (const batch of batches) {
			const questions = buildRunQuestions(batch, config.state.resultPreviewChars);
			const deadline = withDeadline(input.signal, shaping.requestTimeoutMs);
			const startedAt = Date.now();
			try {
				jevRequests += 1;
				metrics.increment(SHAPE_METRICS.requests);
				metrics.add(SHAPE_METRICS.jevInputEstimate, estimateStateTokens(JSON.stringify(state)) + estimateStateTokens(JSON.stringify(questions)));
				const answers = await this.deps.backend.score(state, questions, deadline.signal);
				metrics.add(SHAPE_METRICS.jevLatencyMs, Date.now() - startedAt);
				for (const run of batch) {
					const id = runId(run);
					const routine = answers.get(`${ROUTINE_PREFIX}${id}`);
					const needed = answers.get(`${NEEDED_PREFIX}${id}`);
					scores.set(id, {
						...routine === void 0 ? {} : { routine },
						...needed === void 0 ? {} : { needed }
					});
				}
			} catch (error) {
				metrics.add(SHAPE_METRICS.jevLatencyMs, Date.now() - startedAt);
				metrics.increment(SHAPE_METRICS.errors);
				if (isTimeout(error)) metrics.increment(SHAPE_METRICS.timeouts);
				this.deps.onSkip("jev-error", {
					tool: input.toolName,
					callId: input.callId,
					error: error instanceof Error ? error.message : String(error)
				});
				return;
			} finally {
				deadline.dispose();
			}
		}
		return Object.assign(scores, { jevRequests });
	}
	/**
	* Settle an archive write against the shaper's deadline. The store keeps
	* its own size bound; this bounds how long the tool path may wait for it.
	*/
	withArchiveDeadline(work, signal) {
		if (signal.aborted) return Promise.reject(/* @__PURE__ */ new Error("archive write timed out"));
		return new Promise((resolve, reject) => {
			const onAbort = () => {
				reject(/* @__PURE__ */ new Error("archive write timed out"));
			};
			signal.addEventListener("abort", onAbort, { once: true });
			work.then((value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			}, (error) => {
				signal.removeEventListener("abort", onAbort);
				reject(error instanceof Error ? error : new Error(String(error)));
			});
		});
	}
	/**
	* Store the pre-shaping content. Returns the short reference, `undefined`
	* when archiving is disabled, or `"blocked"` when the archive failed under
	* the `keep-original` policy.
	*/
	async archive(input, config, text) {
		if (!config.archive.enabled) return void 0;
		const metrics = this.deps.metrics;
		const entry = {
			version: 1,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			...input.sessionId === void 0 ? {} : { sessionId: input.sessionId },
			callId: input.callId,
			toolName: input.toolName,
			content: input.content,
			contentHash: contentRef(input.content),
			charCount: Array.from(text).length
		};
		const deadline = withDeadline(input.signal, config.resultShaping.requestTimeoutMs);
		try {
			const ref = await this.withArchiveDeadline(this.deps.archive.put(entry, { signal: deadline.signal }), deadline.signal);
			metrics.increment(SHAPE_METRICS.archiveWrites);
			return shortRef(ref);
		} catch (error) {
			metrics.increment(SHAPE_METRICS.archiveFailures);
			this.deps.onSkip("archive-error", {
				tool: input.toolName,
				callId: input.callId,
				error: error instanceof Error ? error.message : String(error)
			});
			return config.archive.onFailure === "shape-anyway" ? void 0 : "blocked";
		} finally {
			deadline.dispose();
		}
	}
};
//#endregion
//#region src/result-shaping/index.ts
var ResultShapingSubsystem = class {
	deps;
	disposers = [];
	/** Process-scoped counters, separate from historical compaction. */
	metrics = new ShapingMetrics();
	budget = new TurnShapeBudget();
	archive;
	archiveRoot;
	shaper;
	constructor(deps) {
		this.deps = deps;
		const config = deps.readConfig();
		this.archiveRoot = deps.archive === void 0 ? resolveArchiveRoot(config) : void 0;
		this.archive = deps.archive ?? new LocalResultArchive(this.archiveRoot);
		this.shaper = new ImmediateResultShaper({
			readConfig: deps.readConfig,
			backend: deps.backend,
			archive: this.archive,
			metrics: this.metrics,
			onSkip: (reason, details) => {
				this.deps.debug(JEV_EVENTS.shapingSkip, {
					reason,
					...details
				});
			},
			onShaped: (details) => {
				this.deps.info(JEV_EVENTS.shapingApplied, details);
			}
		});
	}
	/** Register the `tools/post-execute` listener (prepended: outer wrapper). */
	register() {
		const host = this.deps.owner;
		this.disposers.push(host.on("tools/post-execute", createPostExecuteListener({
			shaper: this.shaper,
			readConfig: this.deps.readConfig,
			reserveBudget: (exec, chars) => {
				const session = exec.agent?.session;
				return this.budget.tryConsume(session === void 0 ? "" : String(session.header.id), session === void 0 ? void 0 : latestTurn(session), chars, this.deps.readConfig());
			},
			goalFor: (exec) => this.goal(exec),
			onSkip: (reason, details) => {
				this.deps.debug(JEV_EVENTS.shapingSkip, {
					reason,
					...details
				});
			}
		}), { prepend: true }));
	}
	/**
	* Adopt a configuration change: rebuild the archive when its root moved and
	* drop the per-turn budget, whose ceilings may have changed.
	*/
	onConfigChanged() {
		const config = this.deps.readConfig();
		this.budget.reset();
		if (this.deps.archive !== void 0) return;
		const root = resolveArchiveRoot(config);
		if (root === this.archiveRoot) return;
		this.archiveRoot = root;
		this.archive = new LocalResultArchive(root);
		this.shaper = new ImmediateResultShaper({
			readConfig: this.deps.readConfig,
			backend: this.deps.backend,
			archive: this.archive,
			metrics: this.metrics,
			onSkip: (reason, details) => {
				this.deps.debug(JEV_EVENTS.shapingSkip, {
					reason,
					...details
				});
			},
			onShaped: (details) => {
				this.deps.info(JEV_EVENTS.shapingApplied, details);
			}
		});
		this.deps.info(JEV_EVENTS.shapingArchiveRoot, { root });
	}
	/** Retention pass; never on the shaping path, never fatal. */
	async collectArchive() {
		const config = this.deps.readConfig();
		if (!(this.archive instanceof LocalResultArchive)) return;
		try {
			const report = await collectArchive(this.archive, config);
			if (report.deleted > 0 || report.errors > 0) this.deps.info(JEV_EVENTS.shapingArchiveGc, { ...report });
		} catch (error) {
			this.deps.warn(JEV_EVENTS.error, {
				stage: "archive-gc",
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	/** Flat counter snapshot for diagnostics and the `/jev-compact` report. */
	stats() {
		const snapshot = this.metrics.snapshot();
		const counters = {};
		const skipReasons = {};
		const prefix = `${SHAPE_METRICS.skipped}.`;
		for (const [name, value] of Object.entries(snapshot)) if (name.startsWith(prefix)) skipReasons[name.slice(prefix.length)] = value;
		else counters[name] = value;
		return {
			counters,
			skipReasons
		};
	}
	dispose() {
		for (const disposer of this.disposers.splice(0)) try {
			disposer();
		} catch {}
		this.budget.reset();
	}
	/** The current user goal for one execution's classifier state. */
	goal(exec) {
		const session = exec.agent?.session;
		if (session === void 0) return "(no session)";
		try {
			return goalFromSession(session, this.deps.readConfig());
		} catch {
			return "(no recent user text)";
		}
	}
};
//#endregion
//#region src/service.ts
/**
* The `ctx.jevCompaction` service: orchestration of one compaction run
* (SPEC §5.3 pipeline), the automatic pressure trigger on a prepended
* `agent/pre-step` listener, the per-session mutex, cooldown accounting, and
* the deferred manual application demanded by the open-turn invariant (see
* docs/compatibility.md §4).
*
* Fail-open everywhere (SPEC §4): an automatic failure logs and continues;
* the agent loop and the built-in compaction stay untouched.
*/
/** Deterministic rendering of per-candidate reasons. */
function reasonFor(action, scores) {
	if (action === "KEEP_TRUNCATED") return "partial retention score";
	if (scores !== void 0 && scores.needContents < .2) return "low semantic retention score";
	return "below retention thresholds";
}
function countAction(plan, action) {
	return plan.items.filter((item) => item.action === action).length;
}
function createDecisionBackend(readConfig) {
	if (readConfig().decision.provider === "openai") return new OpenAIChatDecisionClient(readConfig);
	return new SystemOneClient(readConfig);
}
var JevCompactionService = class extends Service {
	static inject = ["tokenMeter"];
	static Config = JevCompactionConfigSchema;
	/** The composition entry: the base layer under any settings override. */
	entryConfig;
	/**
	* The active configuration source. It is the composition entry while no
	* settings provider is attached and the resolved settings scope once one
	* is, so a live settings change reaches the next run without a restart.
	*/
	configSource;
	resolvedConfig;
	tokenMeter;
	backend;
	sessions = /* @__PURE__ */ new Map();
	/** Backends whose key warning was already logged, keyed provider+variable. */
	warnedCredentials = /* @__PURE__ */ new Set();
	disposers = [];
	/** Immediate result shaping at `tools/post-execute` (SPEC result-shaping). */
	shaping;
	/** Resolved and immutable configuration (re-resolved on settings change). */
	get config() {
		return this.resolvedConfig;
	}
	constructor(ctx, config = {}, backend) {
		super(ctx, "jevCompaction");
		this.entryConfig = config;
		this.configSource = () => this.entryConfig;
		this.resolvedConfig = resolveJevCompactionConfig(config);
		this.tokenMeter = ctx.tokenMeter;
		this.backend = backend ?? createDecisionBackend(() => this.resolvedConfig);
		this.warnOnMissingCredential();
		this.shaping = new ResultShapingSubsystem({
			owner: ctx,
			readConfig: () => this.resolvedConfig,
			backend: this.backend,
			debug: (event, details) => {
				jevLogger.debug(event, details);
			},
			info: (event, details) => {
				jevLogger.info(event, details);
			},
			warn: (event, details) => {
				jevLogger.warn(event, details);
			}
		});
		this.shaping.register();
		this.disposers.push(ctx.on("agent/pre-step", (payload, next) => this.handlePreStep(payload, next), { prepend: true }));
		ctx.inject(["commands"], (injected) => {
			const commands = injected.commands;
			if (commands === void 0) return;
			this.disposers.push(registerJevCompactCommand(commands, this));
		});
		installJevCompactionSettings({
			owner: ctx,
			entryConfig: this.entryConfig,
			schema: JevCompactionConfigSchema,
			setSource: (current) => {
				this.configSource = current;
			},
			onChange: () => {
				this.reapply();
			},
			validate: (value) => {
				resolveJevCompactionConfig(value);
			}
		});
	}
	/**
	* Re-resolve the runtime configuration from the active source and adopt it.
	* Every failure is contained: an invalid committed value leaves the running
	* plugin on its previous configuration instead of breaking the agent loop.
	*/
	reapply() {
		try {
			this.resolvedConfig = resolveJevCompactionConfig(this.configSource());
			this.onConfigChanged();
		} catch (error) {
			this.reportFailure(error, "");
		}
	}
	/**
	* Hook for subsystems that cache configuration-derived state. Called after
	* every successful re-resolve, including the initial install.
	*/
	onConfigChanged() {
		this.shaping.onConfigChanged();
		this.warnOnMissingCredential();
	}
	/**
	* Say once per configured backend that its API key variable is empty.
	*
	* The environment is not part of the config, so no resolver can refuse this:
	* without the line the first sign is a prune refused minutes later, which
	* reads as "the scorer is broken" rather than "the variable is unset". The
	* provider and the endpoint are logged with the variable name, so the operator
	* can see which backend the deployment actually points at.
	*/
	warnOnMissingCredential() {
		const missing = missingCredential(this.resolvedConfig.decision, this.resolvedConfig.jev, process.env);
		if (missing === void 0) return;
		const key = `${missing.provider}\u0000${missing.apiKeyEnv}`;
		if (this.warnedCredentials.has(key)) return;
		this.warnedCredentials.add(key);
		jevLogger.warn(JEV_EVENTS.credentialMissing, {
			...missing,
			hint: "every Jev decision will fail with \"not configured\" until the variable is set; a backend that needs no key is configured by pointing decision.provider at it (or by an empty apiKeyEnv)"
		});
	}
	/**
	* The `agent/pre-step` listener body. Public for tests; always continues
	* the waterfall (`next()`), never rejects the step.
	*/
	async handlePreStep(payload, next) {
		const sessionId = String(payload.agent.id ?? "");
		try {
			const state = this.sessions.get(sessionId);
			if (state?.pendingManual === true) {
				state.pendingManual = false;
				if ((await this.compact(payload.agent, {
					mode: "manual",
					applyNow: true,
					turn: payload.turn,
					signal: payload.signal
				})).skipped === "busy") state.pendingManual = true;
			} else await this.maybeAutoCompact(payload.agent, payload.turn, payload.signal);
		} catch (error) {
			this.reportFailure(error, sessionId);
		}
		return next();
	}
	/** Automatic pressure-triggered run; swallows every failure. */
	async maybeAutoCompact(agent, turn, signal) {
		try {
			const report = await this.runAuto(agent, turn, signal);
			if (report.skipped !== void 0) jevLogger.debug(JEV_EVENTS.skip, {
				sessionId: report.sessionId,
				reason: report.skipped
			});
		} catch (error) {
			this.reportFailure(error, String(agent.id ?? ""));
		}
	}
	/** Automatic run reporting its outcome; used by tests and diagnostics. */
	runAuto(agent, turn, signal) {
		return this.compact(agent, {
			mode: "auto",
			turn,
			signal
		});
	}
	/** Queue the next pre-step into a manual (gate-bypassing) run. */
	queueManualRun(agent) {
		const state = this.sessionState(String(agent.id ?? ""));
		if (state.pendingManual) return false;
		state.pendingManual = true;
		return true;
	}
	/** Manual dry-run: the full pipeline without any mutation. */
	async runManualDry(agent, signal) {
		return this.compact(agent, {
			mode: "manual",
			dryRun: true,
			signal
		});
	}
	sessionState(sessionId) {
		let state = this.sessions.get(sessionId);
		if (state === void 0) {
			state = {
				lastAutoTurn: void 0,
				running: void 0,
				pendingManual: false
			};
			this.sessions.set(sessionId, state);
		}
		return state;
	}
	reportFailure(error, sessionId) {
		jevLogger.warn(JEV_EVENTS.error, {
			sessionId,
			error: error instanceof Error ? error.message : String(error)
		});
	}
	async compact(agent, options) {
		const mode = options.dryRun === true ? "dry-run" : options.mode;
		const sessionId = String(agent.id ?? "");
		const state = this.sessionState(sessionId);
		const started = Date.now();
		if (state.running !== void 0) return this.skippedReport(mode, sessionId, "busy", started);
		const run = this.runPipeline(agent, options, {
			sessionId,
			started
		}).finally(() => {
			if (state.running === run) state.running = void 0;
		});
		state.running = run;
		return run;
	}
	skippedReport(mode, sessionId, reason, started) {
		return {
			mode,
			sessionId,
			skipped: reason,
			candidates: 0,
			keptFull: 0,
			truncated: 0,
			stubbed: 0,
			charsBefore: 0,
			charsAfter: 0,
			jevRequests: 0,
			totalLatencyMs: Date.now() - started,
			applied: []
		};
	}
	async runPipeline(agent, options, context) {
		const { signal } = options;
		const mode = options.dryRun === true ? "dry-run" : options.mode;
		const { sessionId, started } = context;
		const session = agent.session;
		const state = this.sessionState(sessionId);
		const skip = (reason) => this.skippedReport(mode, sessionId, reason, started);
		if (!this.config.enabled) return skip("disabled");
		const pressure = await measurePressure(session, this.tokenMeter, this.llmRuntime(), signal);
		if (signal.aborted) return skip("busy");
		if (mode === "auto") {
			if (options.turn !== void 0 && state.lastAutoTurn !== void 0 && options.turn - state.lastAutoTurn < this.config.trigger.cooldownTurns) return skip("cooldown");
			if (!(pressure.contextWindow !== void 0 ? (pressure.totalTokens ?? 0) >= pressure.contextWindow * this.config.trigger.contextRatio : (pressure.totalTokens ?? 0) >= this.config.trigger.minSurfaceTokens)) return skip("pressure-not-met");
			if (pressure.estimatedSurfaceTokens < this.config.trigger.minSurfaceTokens) return skip("pressure-not-met");
		}
		const nodeTokens = surfaceNodeTokens(this.tokenMeter, session);
		const { candidates, callIndex } = collectCandidates(session, this.config, nodeTokens);
		const candidateChars = candidates.reduce((sum, candidate) => sum + candidate.originalChars, 0);
		if (mode === "auto" && candidates.length < this.config.trigger.minCandidates) return skip("not-enough-candidates");
		if (mode === "auto" && candidateChars < this.config.trigger.minCandidateChars) return skip("not-enough-candidate-chars");
		if (candidates.length === 0) return skip("no-candidates");
		jevLogger.debug(JEV_EVENTS.check, {
			sessionId,
			mode,
			candidates: candidates.length,
			candidateChars,
			surfaceTokens: pressure.estimatedSurfaceTokens
		});
		const surfaceSnapshot = captureSurfaceSnapshot(session);
		const features = extractFeatures(candidates, callIndex);
		const fitted = fitState(buildState(session, {
			candidates,
			features,
			callIndex
		}, this.config).state, this.config.state.maxStateTokens);
		const batches = batchCandidates(candidates, fitted.tokens, this.config.state.maxRequestTokens);
		let jevRequests = 0;
		const scores = /* @__PURE__ */ new Map();
		try {
			const batchResults = await mapWithConcurrency(batches, this.config.jev.maxConcurrency, async (batch) => {
				const questions = questionsFor(batch);
				jevRequests += 1;
				jevLogger.debug(JEV_EVENTS.request, {
					sessionId,
					questions: questions.length,
					stage: fitted.stage
				});
				return {
					batch,
					answers: await this.backend.score(fitted.state, questions, signal)
				};
			});
			for (const { batch, answers } of batchResults) for (const candidate of batch) {
				const needContents = answers.get(`needContents_${candidate.callId}`);
				const needVerbatim = answers.get(`needVerbatim_${candidate.callId}`);
				if (needContents === void 0) throw new Error(`missing decision for ${candidate.callId}`);
				scores.set(candidate.callId, {
					needContents,
					needVerbatim
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!signal.aborted) this.reportFailure(error, sessionId);
			return {
				...skip("jev-failed"),
				error: message
			};
		}
		const plan = buildPlan(surfaceSnapshot, candidates.map((candidate) => {
			const candidateScores = scores.get(candidate.callId);
			const action = decideAction(candidateScores ?? { needContents: 1 }, this.config);
			if (action === "KEEP_FULL") return {
				candidate,
				features: features.get(candidate.callId),
				scores: candidateScores,
				action,
				replacementChars: candidate.originalChars
			};
			const replacementText = renderReplacement(candidate, action, this.config.pruning.truncateHeadChars, this.config.pruning.truncateTailChars, reasonFor(action, candidateScores));
			return {
				candidate,
				features: features.get(candidate.callId),
				scores: candidateScores,
				action,
				replacementText,
				replacementChars: codePointLength(replacementText)
			};
		}));
		if (mode === "auto" && !meetsSavingsGate(plan.savings, this.config)) return skip("savings-gate");
		jevLogger.info(JEV_EVENTS.plan, {
			sessionId,
			mode,
			candidates: plan.items.length,
			mutations: plan.mutations.length,
			charsSaved: plan.savings.charsSaved,
			jevRequests
		});
		const counts = {
			candidates: plan.items.length,
			keptFull: countAction(plan, "KEEP_FULL"),
			truncated: countAction(plan, "KEEP_TRUNCATED"),
			stubbed: countAction(plan, "KEEP_STUB")
		};
		if (options.dryRun === true || plan.mutations.length === 0) return {
			mode,
			sessionId,
			pressure,
			skipped: plan.mutations.length === 0 ? "empty-plan" : void 0,
			...counts,
			charsBefore: candidateChars,
			charsAfter: candidateChars - plan.savings.charsSaved,
			tokensBefore: pressure.estimatedSurfaceTokens,
			tokensAfter: this.estimateTokensAfter(session, plan),
			jevRequests,
			totalLatencyMs: Date.now() - started,
			applied: [],
			plan: plan.mutations.length > 0 ? plan : void 0
		};
		if (mode === "manual" && options.applyNow !== true) {
			state.pendingManual = true;
			jevLogger.info(JEV_EVENTS.queued, {
				sessionId,
				mutations: plan.mutations.length
			});
			return {
				mode,
				sessionId,
				pressure,
				...counts,
				charsBefore: candidateChars,
				charsAfter: candidateChars - plan.savings.charsSaved,
				tokensBefore: pressure.estimatedSurfaceTokens,
				tokensAfter: this.estimateTokensAfter(session, plan),
				jevRequests,
				totalLatencyMs: Date.now() - started,
				applied: [],
				queuedForNextStep: true,
				plan
			};
		}
		let applied;
		let failureMessage;
		try {
			const outcome = applyPlan(session, plan);
			applied = outcome.applied;
			if (outcome.failure !== void 0) failureMessage = outcome.failure.error instanceof Error ? outcome.failure.error.message : String(outcome.failure.error);
		} catch (error) {
			if (error instanceof SurfaceChangedError) return skip("busy");
			const message = error instanceof Error ? error.message : String(error);
			this.reportFailure(error, sessionId);
			return {
				...skip("jev-failed"),
				error: message
			};
		}
		if (mode === "auto" && options.turn !== void 0) state.lastAutoTurn = options.turn;
		const tokensAfter = this.remeasure(session);
		jevLogger.info(JEV_EVENTS.applied, {
			sessionId,
			mode,
			applied: applied.length,
			replacements: applied.map((entry) => ({
				originalSeq: entry.originalSeq,
				replacementSeq: entry.replacementSeq
			})),
			partial: failureMessage,
			tokensBefore: pressure.estimatedSurfaceTokens,
			tokensAfter
		});
		return {
			mode,
			sessionId,
			pressure,
			...counts,
			charsBefore: candidateChars,
			charsAfter: candidateChars - plan.savings.charsSaved,
			tokensBefore: pressure.estimatedSurfaceTokens,
			tokensAfter,
			jevRequests,
			totalLatencyMs: Date.now() - started,
			applied,
			error: failureMessage,
			plan
		};
	}
	llmRuntime() {
		try {
			return this.ctx.llm;
		} catch {
			return;
		}
	}
	remeasure(session) {
		try {
			return this.tokenMeter.measure(session).surfaceTokens;
		} catch {
			return;
		}
	}
	/** Post-mutation surface token estimate from per-node prices. */
	estimateTokensAfter(session, plan) {
		try {
			const measurement = this.tokenMeter.measure(session);
			const replaced = new Set(plannedSeqs(plan));
			const replacedTokens = measurement.nodes.filter((node) => replaced.has(node.seq)).reduce((sum, node) => sum + node.heuristicTokens, 0);
			const renderedTokens = plan.mutations.reduce((sum, item) => sum + (item.replacementText !== void 0 ? this.tokenMeter.estimateMessage({
				role: "user",
				content: [{
					type: "text",
					text: item.replacementText
				}]
			}) : 0), 0);
			return Math.max(0, measurement.surfaceTokens - replacedTokens + renderedTokens);
		} catch {
			return;
		}
	}
	/** Dispose listeners and the command registration (fail-open teardown). */
	dispose() {
		this.shaping.dispose();
		for (const disposer of this.disposers.splice(0)) try {
			disposer();
		} catch {}
		this.sessions.clear();
	}
};
//#endregion
//#region src/backend/config.ts
/** Keys the engine consumes itself; everything else belongs to the prune service. */
const ENGINE_ONLY_KEYS = /* @__PURE__ */ new Set([
	"summaryRatio",
	"auto",
	"retainRatio",
	"retainTokens",
	"summarizationProvider",
	"summarizationModel",
	"maxTokens",
	"compactionRetries",
	"maxOverflowRetries",
	"modelPolicies"
]);
/** Default summary threshold — strictly above the early-prune default of 0.70. */
const DEFAULT_SUMMARY_RATIO = .82;
function clampProbability(value, label) {
	if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`jev-compaction: ${label} must be within [0, 1]`);
	return value;
}
/**
* Split and validate the engine configuration: companion sections resolve
* through the shared plugin resolver, the summary threshold is validated
* against the early-prune threshold, and the basic-side knobs are collected
* into the object handed to the inherited constructor.
*/
function resolveJevEngineConfig(raw = {}) {
	const summaryRatio = clampProbability(raw.summaryRatio ?? .82, "summaryRatio");
	const auto = raw.auto ?? true;
	const companionRaw = {};
	for (const [key, value] of Object.entries(raw)) if (!ENGINE_ONLY_KEYS.has(key) && value !== void 0) companionRaw[key] = value;
	const companion = resolveJevCompactionConfig(companionRaw);
	if (summaryRatio <= companion.trigger.contextRatio) throw new TypeError(`jev-compaction: summaryRatio (${summaryRatio}) must be greater than trigger.contextRatio (${companion.trigger.contextRatio}) — the early Jev prune must run before the conventional summary`);
	const basic = {
		thresholdRatio: summaryRatio,
		auto,
		...raw.retainRatio === void 0 ? {} : { retainRatio: raw.retainRatio },
		...raw.retainTokens === void 0 ? {} : { retainTokens: raw.retainTokens },
		...raw.summarizationProvider === void 0 ? {} : { summarizationProvider: raw.summarizationProvider },
		...raw.summarizationModel === void 0 ? {} : { summarizationModel: raw.summarizationModel },
		...raw.maxTokens === void 0 ? {} : { maxTokens: raw.maxTokens },
		...raw.compactionRetries === void 0 ? {} : { compactionRetries: raw.compactionRetries },
		...raw.maxOverflowRetries === void 0 ? {} : { maxOverflowRetries: raw.maxOverflowRetries },
		...raw.modelPolicies === void 0 ? {} : { modelPolicies: raw.modelPolicies }
	};
	return {
		engine: {
			summaryRatio,
			auto
		},
		basic,
		companion,
		companionRaw
	};
}
//#endregion
//#region src/backend/engine.ts
/**
* Backend-mode compaction engine (SPEC §6.6, §38 Track B): the plugin
* provides `ctx.compaction` by extending `BasicCompactionEngine`, so
* `/compact` (`dsh-command-compact`), overflow recovery, the deterministic
* size pruner, the compaction event protocol, and balanced summary-range
* selection are all inherited, while semantic Jev pruning runs earlier.
*
* Composition inside one mounted engine:
*
* ```text
* agent/pre-step (waterfall, per step)
*   ├─ nested JevCompactionService (prepended listener)
*   │     armed /jev-compact plan → applies in the open turn
*   │     auto semantic prune at trigger.contextRatio (jevPruneRatio)
*   └─ inherited basic listener
*         compactIfNeeded at summaryRatio → optional size pruner → summary
* ```
*
* Deployment: mount this entry instead of `@deepseek-ai/dsh-compaction-basic`
* (exactly one engine may claim the `compaction` service). The companion
* "." entry stays available for the side-by-side mode (§6.6).
*/
var JevCompactionEngine = class extends BasicCompactionEngine {
	/**
	* Deliberately `z.any()`: the inherited basic schema would strip the
	* companion sections (`decision`, `trigger`, …) from the profile config
	* before this constructor runs. Validation happens strictly in
	* `resolveJevEngineConfig` and fails the mount on bad values.
	*/
	static Config = z.any();
	/** Engine-level configuration (summary threshold, auto listeners). */
	engineConfig;
	/** The nested early-prune service (auto semantic prune, armed plans, `/jev-compact`). */
	prune;
	constructor(ctx, config = {}, backend) {
		const resolved = resolveJevEngineConfig(config);
		super(ctx, resolved.basic);
		this.engineConfig = resolved.engine;
		this.prune = new JevCompactionService(ctx, resolved.companionRaw, backend);
	}
};
//#endregion
//#region src/backend/index.ts
/**
* Backend-mode entry (`dsh-jev-compaction/backend`, SPEC §6.6): mount
* this default export as the profile's compaction engine instead of
* `@deepseek-ai/dsh-compaction-basic`. Semantic Jev pruning runs at the early
* threshold; the inherited basic engine provides the conventional summary
* fallback, `/compact`, and overflow recovery above `summaryRatio`.
*/
/** The profile-row plugin entry. */
var backend_default = JevCompactionEngine;
//#endregion
export { DEFAULT_SUMMARY_RATIO, JevCompactionEngine, backend_default as default, resolveJevEngineConfig };
