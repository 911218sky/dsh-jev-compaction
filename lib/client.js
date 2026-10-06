window.__ModuleLoader__.load({
	id: "dsh-jev-compaction",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/shared/settings.ts
		/**
		* The settings namespace / profile entry id, shared by the Host live-settings
		* adapter and the browser card so the two can never drift apart. This module
		* must stay dependency free: the card bundle inlines it, and pulling the
		* config schema (and with it Schemastery) into the page would bloat the
		* bundle for one string.
		*
		* On DSH 0.2, SettingsForms / configForms key the cordis entry id from
		* cordis.patch.yml (`dsh-jev-compaction`), not a separate short namespace.
		*/
		/** Cordis entry id and SettingsForms / configForms / slot key. */
		const JEV_COMPACTION_ENTRY_ID = "dsh-jev-compaction";
		/** @deprecated Prefer {@link JEV_COMPACTION_ENTRY_ID}; kept as an alias. */
		const JEV_COMPACTION_SETTINGS_NAMESPACE = JEV_COMPACTION_ENTRY_ID;
		//#endregion
		//#region src/client/config-form-adapter.ts
		const NESTED_PATH = {
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
			minClassificationConfidence: ["resultShaping", "minClassificationConfidence"],
			logLevel: ["diagnostics", "logLevel"]
		};
		function flatten(value) {
			if (value === void 0) return void 0;
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
				minClassificationConfidence: value.resultShaping?.minClassificationConfidence,
				logLevel: value.diagnostics?.logLevel
			};
		}
		function flattenLayer(layer) {
			if (layer === void 0 || layer === null || typeof layer !== "object") return layer;
			return flattenUserLayer(layer);
		}
		/** Flatten nested user/base layers so override badges match nested paths. */
		function flattenUserLayer(user) {
			const flat = {};
			for (const [field, path] of Object.entries(NESTED_PATH)) {
				let cursor = user;
				for (const segment of path) {
					if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, segment)) {
						cursor = void 0;
						break;
					}
					cursor = cursor[segment];
				}
				if (cursor !== void 0) flat[field] = cursor;
			}
			return flat;
		}
		function nestedPath(field) {
			if (field in NESTED_PATH) return NESTED_PATH[field];
			return [field];
		}
		/** Adapt ConfigForm&lt;nested Config&gt; into the flat scope SettingsFormModel uses. */
		function flatSettingsFormScope(form) {
			return {
				getSnapshot() {
					const snap = form.getSnapshot();
					return {
						status: snap.status,
						value: flatten(snap.value),
						base: flattenLayer(snap.base),
						user: flattenLayer(snap.user),
						revision: snap.revision,
						writable: snap.writable
					};
				},
				subscribe(listener) {
					return form.subscribe(listener);
				},
				mutate(ops, expectedRevision) {
					const nested = ops.map((op) => {
						const field = op.path[0];
						const path = typeof field === "string" ? nestedPath(field) : [...op.path];
						return op.op === "set" ? {
							op: "set",
							path,
							value: op.value
						} : {
							op: "unset",
							path
						};
					});
					return form.mutate(nested, expectedRevision);
				}
			};
		}
		//#endregion
		//#region src/client/format.ts
		/**
		* Read-only helpers for the settings card.
		*/
		const BYTE_UNITS = [
			"B",
			"KB",
			"MB",
			"GB"
		];
		/** Human-readable byte size for the archive limit field. */
		function formatBytes(bytes) {
			let value = bytes;
			let unit = 0;
			while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return `${Math.round(value * 10) / 10} ${BYTE_UNITS[unit]}`;
		}
		/**
		* Say how many candidate runs the current thresholds plausibly admit. This is
		* a read-only projection of the trigger numbers, not a measurement.
		*/
		function triggerSummary(thresholdChars, minLines) {
			return `${thresholdChars} chars, ${minLines}+ lines, or repeated lines`;
		}
		//#endregion
		//#region src/client/decision-diag.ts
		/**
		* Describe whether the configured decision backend looks usable from settings alone.
		* Empty `apiKeyEnv` is intentional for keyless custom backends; for named providers
		* it usually means every prune will fail-open with `jev-failed`.
		*/
		function decisionBackendDiag(provider, apiKeyEnv, enabled) {
			if (!enabled) return {
				severity: "ok",
				message: "Plugin disabled — semantic pruning will not run."
			};
			const envName = apiKeyEnv.trim();
			if (envName.length === 0) {
				if (provider === "custom") return {
					severity: "ok",
					message: "Custom provider with empty API key env — keyless local backends are OK. If the endpoint needs a key, set apiKeyEnv or prune will fail-open (jev-failed)."
				};
				return {
					severity: "warn",
					message: `Provider "${provider}" has no apiKeyEnv. Every Jev decision will fail with "not configured" and pruning will skip fail-open (jev-failed) until the variable name is set.`
				};
			}
			return {
				severity: "ok",
				message: `Host reads process.env.${envName} for provider "${provider}". If that variable is missing or the network fails, pruning skips fail-open (jev-failed) and chat continues. Check /jev-compact reports for skip reasons.`
			};
		}
		/** Static archive limit note shown beside settings (not tunable). */
		const ARCHIVE_ENTRY_LIMIT_HINT = "Each archived original is capped at 64 MiB; larger tool dumps are not archived and follow the onFailure policy.";
		//#endregion
		//#region src/client/JevCompactionCard.tsx
		/**
		* Jev Compaction settings card using DSH SettingsForm / SettingsValueField /
		* Checkbox / ConfigField — same chrome as official settings plugins.
		*/
		const CARD_DESCRIPTION = "Semantic result shaping and historical context compaction powered by Jev.";
		/** Display fallbacks only — keep Schemastery out of the browser bundle. */
		const DISPLAY_DEFAULTS = {
			enabled: true,
			resultShapingEnabled: false,
			archiveEnabled: true,
			provider: "openai",
			model: "gpt-4o-mini",
			thresholdChars: 12e3,
			minLines: 80,
			preserveErrors: true,
			archiveMaxBytes: 1073741824
		};
		const FORM_LABELS = {
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			readOnly: "This deployment stores settings read-only.",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			save: "Save",
			saving: "Saving…"
		};
		const FIELD_LABELS = {
			overridden: "Overridden",
			reset: "Reset to default",
			invalidNumber: "Enter a valid number, or leave blank to use the default.",
			invalidRatio: "Enter a number between 0 and 1, or leave blank for the default.",
			invalidPercent: "Enter a whole number between 0 and 100, or leave blank for the default.",
			invalidEnum: "Choose one of the listed values, or reset to the default."
		};
		function boolFromField(field, fallback) {
			if (field.text === "true") return true;
			if (field.text === "false") return false;
			return fallback;
		}
		function numberFromField(field, fallback) {
			const parsed = Number(field.text);
			return Number.isFinite(parsed) ? parsed : fallback;
		}
		function Section(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: props.title }), props.children] });
		}
		function Hint(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.children });
		}
		function Warning(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				children: props.children
			});
		}
		function valueField(field, state, props, options) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
				id: `jev-compaction-${field}`,
				label: options.label,
				hint: options.hint,
				overriddenLabel: FIELD_LABELS.overridden,
				resetLabel: FIELD_LABELS.reset,
				invalidLabel: options.invalidLabel ?? FIELD_LABELS.invalidNumber,
				numeric: options.numeric,
				placeholder: options.placeholder,
				disabled: !state.writable,
				...state[field],
				onEdit: (text) => props.edit(field, text),
				onReset: () => props.resetField(field)
			}, field);
		}
		function selectField(field, state, props, options) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.ConfigField, {
				label: options.label,
				value: state[field].text,
				secret: false,
				choices: options.choices,
				disabled: !state.writable,
				overridden: state[field].overridden,
				invalid: state[field].invalid,
				labels: {
					reset: FIELD_LABELS.reset,
					inherited: FIELD_LABELS.overridden,
					invalid: FIELD_LABELS.invalidEnum
				},
				onChange: (value) => props.edit(field, value),
				onReset: () => props.resetField(field)
			}, field);
		}
		/** Render the Jev Compaction settings card. */
		function JevCompactionCard(props) {
			const state = props.useJevCompactionCard((snapshot) => snapshot);
			if ("view" in props && props.view === "summary") return CARD_DESCRIPTION;
			if (!state.available) return null;
			const disabled = !state.writable;
			const enabled = boolFromField(state.enabled, DISPLAY_DEFAULTS.enabled);
			const shapingEnabled = boolFromField(state.resultShapingEnabled, DISPLAY_DEFAULTS.resultShapingEnabled);
			const archiveEnabled = boolFromField(state.archiveEnabled, DISPLAY_DEFAULTS.archiveEnabled);
			const provider = state.provider.text || DISPLAY_DEFAULTS.provider;
			const model = state.model.text || DISPLAY_DEFAULTS.model;
			const thresholdChars = numberFromField(state.thresholdChars, DISPLAY_DEFAULTS.thresholdChars);
			const archiveMaxBytes = numberFromField(state.archiveMaxBytes, DISPLAY_DEFAULTS.archiveMaxBytes);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				labels: FORM_LABELS,
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: CARD_DESCRIPTION }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						title: "General",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
							"Status: ",
							enabled ? "Enabled" : "Disabled",
							" · Provider: ",
							provider,
							" · Model: ",
							model
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
							label: "Enable Jev Compaction",
							checked: enabled,
							disabled,
							onChange: (checked) => props.edit("enabled", checked ? "true" : "false")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						title: "Immediate result shaping",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: "Semantically compress large repetitive tool outputs before they are written to conversation history. Runs on the tool-execution path, so the original rendered result is not recoverable from session replay unless the archive below is on." }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
								label: "Shape tool results before they are persisted",
								checked: shapingEnabled,
								disabled,
								onChange: (checked) => props.edit("resultShapingEnabled", checked ? "true" : "false")
							}),
							shapingEnabled && !archiveEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Warning, { children: "Shaped output may not be recoverable from session replay: the original-output archive is off." }) : null,
							valueField("includeTools", state, props, {
								label: "Eligible tools",
								hint: "One tool name per line. Only these tools may be shaped.",
								placeholder: "bash"
							}),
							valueField("excludeTools", state, props, {
								label: "Never shape these tools",
								hint: "One tool name per line. Exclusions win over the eligible list.",
								placeholder: "add an excluded tool"
							}),
							valueField("thresholdChars", state, props, {
								label: "Minimum result size (characters)",
								numeric: true
							}),
							valueField("maxPerTurn", state, props, {
								label: "Maximum shaped results per turn",
								numeric: true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
								label: "Preserve errors",
								checked: boolFromField(state.preserveErrors, DISPLAY_DEFAULTS.preserveErrors),
								disabled,
								onChange: (checked) => props.edit("preserveErrors", checked ? "true" : "false")
							}),
							valueField("minSavingsRatio", state, props, {
								label: "Minimum savings ratio (0–1)",
								hint: "A shaping that saves less than this is discarded.",
								invalidLabel: FIELD_LABELS.invalidRatio,
								numeric: true
							}),
							valueField("minSavingsChars", state, props, {
								label: "Minimum savings (characters)",
								numeric: true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Hint, { children: [
								"Trigger:",
								" ",
								triggerSummary(thresholdChars, DISPLAY_DEFAULTS.minLines),
								"."
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						title: "Original output archive",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: "Immediate shaping happens before DSH persists the final tool result. Archiving keeps a local copy of the original rendered output for diagnostics and future recovery." }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
								label: "Archive the original output",
								checked: archiveEnabled,
								disabled,
								onChange: (checked) => props.edit("archiveEnabled", checked ? "true" : "false")
							}),
							!archiveEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Warning, { children: "Shaped output may not be recoverable from session replay." }) : null,
							valueField("retentionDays", state, props, {
								label: "Retention (days; 0 = keep forever)",
								numeric: true
							}),
							valueField("archiveMaxBytes", state, props, {
								label: "Maximum archive size (bytes)",
								hint: `Currently ${formatBytes(archiveMaxBytes)}. 0 disables the size cap.`,
								numeric: true
							}),
							selectField("onFailure", state, props, {
								label: "If archiving fails",
								hint: "Fail-open by default: an unarchived result is never shaped.",
								choices: ["keep-original", "shape-anyway"]
							}),
							valueField("rootPath", state, props, {
								label: "Archive root",
								hint: "Absolute path, or empty for the harness home. Changing it needs a restart.",
								placeholder: "default: $DSH_HOME/data/dsh-jev-compaction/originals"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: ARCHIVE_ENTRY_LIMIT_HINT })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						title: "Historical compaction",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: "When context grows, semantically prune stale historical tool results before falling back to ordinary summary compaction." }),
							valueField("contextRatio", state, props, {
								label: "Start semantic pruning at (% of model context)",
								invalidLabel: FIELD_LABELS.invalidPercent,
								numeric: true
							}),
							valueField("minSurfaceTokens", state, props, {
								label: "Minimum surface tokens",
								numeric: true
							}),
							valueField("recentMessages", state, props, {
								label: "Preserve recent messages",
								numeric: true
							}),
							valueField("recentTokens", state, props, {
								label: "Preserve recent tokens",
								numeric: true
							}),
							valueField("fullThreshold", state, props, {
								label: "Full-keep threshold (0–1)",
								hint: "Above this retention score a result stays full.",
								invalidLabel: FIELD_LABELS.invalidRatio,
								numeric: true
							}),
							valueField("truncateThreshold", state, props, {
								label: "Truncate threshold (0–1)",
								hint: "Above this a result keeps a truncated head and tail instead of a stub.",
								invalidLabel: FIELD_LABELS.invalidRatio,
								numeric: true
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
						title: "Decision backend",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: "Scoring backend for semantic retention. Use openai for any OpenAI-compatible chat API, or a System One endpoint." }),
							(() => {
								const provider = state.provider.text.trim() || DISPLAY_DEFAULTS.provider;
								const apiKeyEnv = state.apiKeyEnv.text;
								const diag = decisionBackendDiag(provider, apiKeyEnv, enabled);
								return diag.severity === "warn" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Warning, { children: diag.message }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: diag.message });
							})(),
							selectField("provider", state, props, {
								label: "Provider",
								choices: [
									"openai",
									"typesafe",
									"jeff",
									"custom"
								]
							}),
							valueField("baseUrl", state, props, {
								label: "Endpoint",
								placeholder: "https://api.openai.com/v1"
							}),
							valueField("model", state, props, { label: "Model" }),
							valueField("apiKeyEnv", state, props, {
								label: "API key environment variable",
								hint: "Only the variable name is stored and shown. The key itself is read on the Host and never reaches this page.",
								placeholder: "TYPESAFE_API_KEY"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: "Advanced" }),
						valueField("timeoutMs", state, props, {
							label: "Request timeout (ms)",
							numeric: true
						}),
						valueField("maxConcurrency", state, props, {
							label: "Concurrent Jev requests",
							numeric: true
						}),
						valueField("maxStateTokens", state, props, {
							label: "Jev state token ceiling",
							numeric: true
						}),
						valueField("keepHeadLines", state, props, {
							label: "Head lines kept per shaped result",
							numeric: true
						}),
						valueField("keepTailLines", state, props, {
							label: "Tail lines kept per shaped result",
							numeric: true
						}),
						valueField("minClassificationConfidence", state, props, {
							label: "Minimum classification confidence (0–1)",
							hint: "Below this the group is kept.",
							invalidLabel: FIELD_LABELS.invalidRatio,
							numeric: true
						}),
						selectField("logLevel", state, props, {
							label: "Log level",
							choices: [
								"silent",
								"error",
								"warn",
								"info",
								"debug",
								"trace"
							]
						})
					] })
				]
			});
		}
		//#endregion
		//#region src/client/settings-scope.ts
		/**
		* Flat settings shape for SettingsFormModel. Nested Host config is adapted
		* through config-form-adapter.ts before the form reads or writes it.
		*/
		/** Flat field names the card stages and saves. */
		const FLAT_FIELD_NAMES = [
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
			"logLevel"
		];
		//#endregion
		//#region src/client/jev-card-controller.ts
		/**
		* Settings card controller built on DSH SettingsFormModel — same pattern as
		* dsh-headroom and @deepseek-ai/dsh-client-ui-settings-shell.
		*/
		function settingsBooleanField(field) {
			return {
				field,
				format: (value) => value === true ? "true" : value === false ? "false" : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					if (trimmed === "true") return {
						kind: "set",
						value: true
					};
					if (trimmed === "false") return {
						kind: "set",
						value: false
					};
				}
			};
		}
		function settingsProbabilityField(field) {
			return {
				field,
				format: (value) => typeof value === "number" ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					const parsed = Number(trimmed);
					if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return;
					return {
						kind: "set",
						value: parsed
					};
				}
			};
		}
		function settingsPercentField(field) {
			return {
				field,
				format: (value) => typeof value === "number" ? String(Math.round(value * 100)) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					const parsed = Number(trimmed);
					if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
					return {
						kind: "set",
						value: parsed / 100
					};
				}
			};
		}
		function settingsStringListField(field) {
			return {
				field,
				format: (value) => Array.isArray(value) ? value.filter((entry) => typeof entry === "string").join("\n") : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					const seen = /* @__PURE__ */ new Set();
					const values = [];
					for (const line of trimmed.split("\n")) {
						const entry = line.trim();
						if (entry.length === 0 || seen.has(entry)) continue;
						seen.add(entry);
						values.push(entry);
					}
					return {
						kind: "set",
						value: values
					};
				}
			};
		}
		function settingsEnumField(field, allowed) {
			return {
				field,
				format: (value) => typeof value === "string" ? value : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					if (!allowed.includes(trimmed)) return void 0;
					return {
						kind: "set",
						value: trimmed
					};
				}
			};
		}
		const FIELD_SPECS = [
			settingsBooleanField("enabled"),
			settingsBooleanField("resultShapingEnabled"),
			settingsStringListField("includeTools"),
			settingsStringListField("excludeTools"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("thresholdChars"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("maxPerTurn"),
			settingsBooleanField("preserveErrors"),
			settingsProbabilityField("minSavingsRatio"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("minSavingsChars"),
			settingsBooleanField("archiveEnabled"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("retentionDays"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("archiveMaxBytes"),
			settingsEnumField("onFailure", ["keep-original", "shape-anyway"]),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("rootPath"),
			settingsPercentField("contextRatio"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("minSurfaceTokens"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("recentMessages"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("recentTokens"),
			settingsProbabilityField("fullThreshold"),
			settingsProbabilityField("truncateThreshold"),
			settingsEnumField("provider", [
				"openai",
				"typesafe",
				"jeff",
				"custom"
			]),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("baseUrl"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("model"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)("apiKeyEnv"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("timeoutMs"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("maxConcurrency"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("maxStateTokens"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("keepHeadLines"),
			(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("keepTailLines"),
			settingsProbabilityField("minClassificationConfidence"),
			settingsEnumField("logLevel", [
				"silent",
				"error",
				"warn",
				"info",
				"debug",
				"trace"
			])
		];
		var JevCompactionCardController = class {
			form;
			store;
			constructor(scope) {
				this.form = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, FIELD_SPECS);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				const shell = this.form.shell();
				const fields = Object.fromEntries(FLAT_FIELD_NAMES.map((field) => [field, this.form.field(field)]));
				return {
					...shell,
					...fields
				};
			}
			inject() {
				return {
					hooks: { jevCompactionCard: this.store },
					...this.form.actions()
				};
			}
			dispose() {
				this.form.dispose();
			}
		};
		//#endregion
		//#region src/client/index.tsx
		/** Required services (cordis fiber inject). */
		const inject = ["slots", "configForms"];
		/** Bind the settings namespace and register the settings card. */
		function apply(ctx) {
			const face = ctx;
			const form = face.configForms?.get?.(JEV_COMPACTION_ENTRY_ID);
			if (form === void 0 || face.slots === void 0) return;
			const controller = new JevCompactionCardController(flatSettingsFormScope(form));
			ctx.effect(() => () => controller.dispose(), "dsh-jev-compaction: card controller lifetime");
			face.slots.inject("settings.plugin.item", function* () {
				yield face.slots.register({
					name: "settings.plugin.item",
					key: JEV_COMPACTION_SETTINGS_NAMESPACE,
					inject: () => controller.inject()
				}, JevCompactionCard);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map