window.__ModuleLoader__.load({
	id: "dsh-jev-compaction",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region node_modules/@yadsh/dsh-plugin-kit/lib/client/plugin-card-css.js
		/**
		* Canonical DSH settings-plugin card shell CSS — the single source of truth
		* for the shared `dsh-plugin-card` outer shell (see AGENTS.md). Plugins must
		* inject this CSS unchanged and may only append rules for their own controls
		* inside the card body; plugin-specific shell styling is forbidden.
		*/
		const PLUGIN_CARD_SHELL_CSS = `
.dsh-plugin-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dsh-plugin-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dsh-plugin-card--open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dsh-plugin-card__header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dsh-plugin-card__header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-plugin-card__head-text{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dsh-plugin-card__name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dsh-plugin-card__description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dsh-plugin-card__badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dsh-plugin-card__chevron{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.dsh-plugin-card--open .dsh-plugin-card__chevron{transform:rotate(180deg)}
.dsh-plugin-card__body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
`;
		//#endregion
		//#region node_modules/@yadsh/dsh-plugin-kit/lib/client/chevron.js
		/**
		* The standard disclosure chevron of the shared settings-card shell: a
		* 14x14 inline SVG stroked with `currentColor` (round caps and joins).
		* Font glyphs must not be used for this shape — their appearance and
		* baseline vary by font and encoding.
		*
		* The shell class is the default; a control outside the card body passes its
		* own class and keeps this path, so the shape stays one shape across the UI.
		*/
		function ChevronDown({ className = "dsh-plugin-card__chevron" } = {}) {
			return (0, react_jsx_runtime.jsx)("svg", {
				className,
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				children: (0, react_jsx_runtime.jsx)("path", {
					d: "m3.5 5.25 3.5 3.5 3.5-3.5",
					stroke: "currentColor",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		Object.freeze([
			"api-key",
			"personal-access-token",
			"oauth",
			"service-account",
			"app-password",
			"custom"
		]);
		Object.freeze({
			"api-key": "Создать API-ключ",
			"personal-access-token": "Создать токен доступа",
			oauth: "Войти и авторизовать",
			"service-account": "Создать сервисный аккаунт",
			"app-password": "Создать пароль приложения",
			custom: "Как получить доступ"
		});
		//#endregion
		//#region node_modules/@yadsh/dsh-plugin-kit/lib/client/card-shell.js
		/**
		* Shared outer shell of a plugin configuration card (AGENTS.md contract): a
		* direct `<li>` child of the host list with a full-width header button
		* (`type="button"`, `aria-expanded`, accessible show/hide label, the
		* title/description stack, an optional status badge, then the chevron) and a
		* body rendered only while open. Plugin-specific controls belong inside the
		* body and must not restyle the shell.
		*/
		function CardShell(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const body = props.bodyClassName === void 0 ? "dsh-plugin-card__body" : `dsh-plugin-card__body ${props.bodyClassName}`;
			return (0, react_jsx_runtime.jsxs)("li", {
				className: open ? "dsh-plugin-card dsh-plugin-card--open" : "dsh-plugin-card",
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-plugin-card__header",
					"aria-expanded": open,
					"aria-label": props.label(open),
					onClick: () => {
						setOpen(!open);
					},
					children: [
						(0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-plugin-card__head-text",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "dsh-plugin-card__name",
								children: props.title
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-plugin-card__description",
								children: props.description
							})]
						}),
						props.badge ?? null,
						(0, react_jsx_runtime.jsx)(ChevronDown, {})
					]
				}), open ? (0, react_jsx_runtime.jsx)("div", {
					className: body,
					children: props.children
				}) : null]
			});
		}
		function noop$1() {}
		/**
		* Inject one stylesheet tag for the plugin's card CSS. The tag carries
		* `data-plugin="<pluginName>"` and is guarded against double injection; the
		* returned disposer removes the tag when this call created it. No-op in
		* non-DOM environments (headless bundles, module probes).
		*/
		function injectCardStyles(pluginName, css) {
			if (typeof document === "undefined") return noop$1;
			const selector = `style[data-plugin="${pluginName}"]`;
			if (typeof document.querySelector === "function" && document.querySelector(selector) !== null) return noop$1;
			const tag = document.createElement("style");
			tag.dataset.plugin = pluginName;
			tag.textContent = css;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}
		/**
		* Register the card component into the shared settings-plugins slot. Returns
		* the registration disposer. Use this variant when the plugin drives the
		* slot's inject-factory itself (e.g. to dispose a form controller alongside).
		*/
		function registerSettingsSlot(host, options) {
			const slotOptions = {
				name: options.slotName ?? "settings.plugin.item",
				key: options.key,
				...options.locale === void 0 ? {} : { locale: options.locale },
				...options.inject === void 0 ? {} : { inject: options.inject }
			};
			return host.slots.register(slotOptions, options.component);
		}
		/**
		* Full bootstrap: inject {@link options.styles} once (when provided), then
		* mount the card into the settings-plugins slot. Returns a disposer removing
		* the slot effect and the injected stylesheet.
		*/
		function registerSettingsCard(host, options) {
			const removeStyles = options.styles === void 0 || options.pluginName === void 0 ? void 0 : injectCardStyles(options.pluginName, options.styles);
			const slotName = options.slotName ?? "settings.plugin.item";
			const disposeEffect = host.slots.inject(slotName, () => registerSettingsSlot(host, options));
			return () => {
				disposeEffect();
				removeStyles?.();
			};
		}
		//#endregion
		//#region node_modules/@yadsh/dsh-plugin-kit/lib/client/settings-store.js
		/**
		* React calls external-store callbacks as plain functions, while
		* SettingsScope's methods depend on their receiver. Forwarding the methods
		* directly loses `this` and crashes while reading the internal store, so
		* bind them through stable wrappers.
		*/
		function bindSettingsExternalStore(scope) {
			return {
				subscribe: (listener) => scope.subscribe(listener),
				getSnapshot: () => scope.getSnapshot()
			};
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
		//#region src/client/controls.tsx
		function Toggle(props) {
			const id = (0, react.useId)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "jevc-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "jevc-row-text",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "jevc-row-label",
						htmlFor: id,
						children: [props.label, props.overridden === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jevc-chip",
							children: " · overridden"
						}) : null]
					}), props.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "jevc-row-description",
						children: props.description
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					id,
					type: "checkbox",
					className: "jevc-toggle",
					checked: props.checked,
					disabled: props.disabled,
					onChange: (event) => {
						props.onToggle(event.target.checked);
					}
				})]
			});
		}
		function NumberField(props) {
			const id = (0, react.useId)();
			const [draft, setDraft] = (0, react.useState)(String(props.value));
			(0, react.useEffect)(() => {
				setDraft(String(props.value));
			}, [props.value]);
			const commit = () => {
				const text = draft.trim();
				if (text.length === 0) {
					props.onCommit(null);
					return;
				}
				const parsed = Number(text);
				if (!Number.isFinite(parsed)) {
					props.onInvalid?.(text);
					setDraft(String(props.value));
					return;
				}
				props.onCommit(parsed);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "jevc-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "jevc-field-label",
						htmlFor: id,
						children: [props.label, props.overridden === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jevc-chip",
							children: " · overridden"
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "jevc-inline",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id,
							type: "number",
							className: "jevc-input jevc-input--number",
							value: draft,
							min: props.min,
							max: props.max,
							step: props.step ?? 1,
							disabled: props.disabled,
							onChange: (event) => {
								setDraft(event.target.value);
							},
							onBlur: commit,
							onKeyDown: (event) => {
								if (event.key === "Enter") commit();
							}
						}), props.unit === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jevc-unit",
							children: props.unit
						})]
					}),
					props.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "jevc-hint",
						children: props.description
					})
				]
			});
		}
		function TextField(props) {
			const id = (0, react.useId)();
			const [draft, setDraft] = (0, react.useState)(props.value);
			(0, react.useEffect)(() => {
				setDraft(props.value);
			}, [props.value]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "jevc-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "jevc-field-label",
						htmlFor: id,
						children: [props.label, props.overridden === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jevc-chip",
							children: " · overridden"
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id,
						type: "text",
						className: "jevc-input",
						value: draft,
						placeholder: props.placeholder,
						disabled: props.disabled,
						onChange: (event) => {
							setDraft(event.target.value);
						},
						onBlur: () => {
							props.onCommit(draft.trim());
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") props.onCommit(draft.trim());
						}
					}),
					props.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "jevc-hint",
						children: props.description
					})
				]
			});
		}
		function SelectField(props) {
			const id = (0, react.useId)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "jevc-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "jevc-field-label",
						htmlFor: id,
						children: [props.label, props.overridden === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jevc-chip",
							children: " · overridden"
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						id,
						className: "jevc-input",
						value: props.value,
						disabled: props.disabled,
						onChange: (event) => {
							props.onCommit(event.target.value);
						},
						children: props.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: option.value,
							children: option.label
						}, option.value))
					}),
					props.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "jevc-hint",
						children: props.description
					})
				]
			});
		}
		/**
		* Editable list of tool names: entries render as removable chips plus a text
		* input that appends on Enter, so a list is never emptied by a stray
		* keystroke.
		*/
		function TagListField(props) {
			const id = (0, react.useId)();
			const [draft, setDraft] = (0, react.useState)("");
			const add = () => {
				const value = draft.trim();
				if (value.length === 0) return;
				if (props.values.includes(value)) {
					setDraft("");
					return;
				}
				props.onCommit([...props.values, value]);
				setDraft("");
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "jevc-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "jevc-field-label",
						htmlFor: id,
						children: [props.label, props.overridden === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jevc-chip",
							children: " · overridden"
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "jevc-tags",
						children: props.values.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jevc-empty",
							children: "none"
						}) : props.values.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "jevc-tag",
							children: [value, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "jevc-tag-remove",
								"aria-label": `Remove ${value}`,
								disabled: props.disabled,
								onClick: () => {
									props.onCommit(props.values.filter((entry) => entry !== value));
								},
								children: "×"
							})]
						}, value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "jevc-inline",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id,
							type: "text",
							className: "jevc-input",
							value: draft,
							placeholder: props.placeholder ?? "add a tool name",
							disabled: props.disabled,
							onChange: (event) => {
								setDraft(event.target.value);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									add();
								}
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "jevc-button",
							disabled: props.disabled || draft.trim().length === 0,
							onClick: add,
							children: "Add"
						})]
					}),
					props.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "jevc-hint",
						children: props.description
					})
				]
			});
		}
		//#endregion
		//#region src/client/format.ts
		/**
		* Read-only helpers for the card: the badge, override detection on the raw
		* user layer, and byte formatting for the archive limit.
		*
		* Overrides are detected by *presence* in the user layer (the settings
		* contract's own rule), never by comparing values: a user who re-saves the
		* deployment default still owns that field, and the card has to show it.
		*/
		function asRecord(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return;
			return value;
		}
		/** True when the user layer carries an override at this path. */
		function isOverridden(user, ...path) {
			let cursor = user;
			for (const segment of path) {
				const record = asRecord(cursor);
				if (record === void 0 || !Object.hasOwn(record, segment)) return false;
				cursor = record[segment];
			}
			return true;
		}
		/** Top-level keys the user layer overrides. */
		function overriddenKeys(user) {
			const record = asRecord(user);
			return record === void 0 ? [] : Object.keys(record);
		}
		/** Header badge: on/off plus why it is off. */
		function badgeText(enabled, shapingEnabled) {
			if (!enabled) return "disabled";
			return shapingEnabled ? "on · shaping" : "on";
		}
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
		/** Split a byte amount into the largest whole-unit pair for the size field. */
		function splitBytes(bytes) {
			let value = bytes;
			let unit = 0;
			while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return {
				value: Math.round(value * 100) / 100,
				unit: BYTE_UNITS[unit]
			};
		}
		/** Multiply a unit back into bytes; unknown units fall back to bytes. */
		function toBytes(value, unit) {
			const index = BYTE_UNITS.indexOf(unit);
			if (index < 0) return value;
			return Math.round(value * 1024 ** index);
		}
		/**
		* Say how many candidate runs the current thresholds plausibly admit. This is
		* a read-only projection of the trigger numbers, not a measurement: the card
		* must never imply it measured a generation it did not run.
		*/
		function triggerSummary(thresholdChars, minLines) {
			return `${thresholdChars} chars, ${minLines}+ lines, or repeated lines`;
		}
		//#endregion
		//#region src/client/card.tsx
		const PROVIDER_OPTIONS = [
			{
				value: "openai",
				label: "OpenAI-compatible chat (any gateway)"
			},
			{
				value: "typesafe",
				label: "TypeSafe Jev (hosted System One)"
			},
			{
				value: "jeff",
				label: "Self-hosted System One-compatible server"
			},
			{
				value: "custom",
				label: "Custom System One endpoint"
			}
		];
		const ARCHIVE_FAILURE_OPTIONS = [{
			value: "keep-original",
			label: "Keep the original result (recommended)"
		}, {
			value: "shape-anyway",
			label: "Shape anyway"
		}];
		const LOG_LEVEL_OPTIONS = [
			{
				value: "silent",
				label: "silent"
			},
			{
				value: "error",
				label: "error"
			},
			{
				value: "warn",
				label: "warn"
			},
			{
				value: "info",
				label: "info"
			},
			{
				value: "debug",
				label: "debug"
			},
			{
				value: "trace",
				label: "trace"
			}
		];
		function displayError(error) {
			if (error instanceof Error) return error.message;
			if (typeof error === "string") return error;
			if (typeof error === "object" && error !== null) {
				const message = error.message;
				if (typeof message === "string") return message;
			}
			return "The Host rejected that value.";
		}
		/** The schema, not the card, owns the ranges; say so instead of guessing. */
		function rangeError(text) {
			return `"${text}" is outside this field's configured range.`;
		}
		function JevCompactionCard({ scope }) {
			const store = (0, react.useMemo)(() => bindSettingsExternalStore(scope), [scope]);
			const settings = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
			const config = settings.value;
			const writable = settings.status === "ready" && settings.writable;
			const [error, setError] = (0, react.useState)(null);
			const fail = (0, react.useCallback)((cause) => {
				setError(displayError(cause));
			}, []);
			const write = (0, react.useCallback)((path, value) => {
				scope.mutate([{
					op: "set",
					path,
					value
				}]).catch(fail);
			}, [scope, fail]);
			const clear = (0, react.useCallback)((path) => {
				scope.mutate([{
					op: "unset",
					path
				}]).catch(fail);
			}, [scope, fail]);
			const overrides = overriddenKeys(settings.user);
			const resetAll = (0, react.useCallback)(() => {
				const ops = overrides.map((key) => ({
					op: "unset",
					path: [key]
				}));
				scope.mutate(ops).catch(fail);
			}, [
				overrides,
				scope,
				fail
			]);
			const overridden = (0, react.useCallback)((path) => isOverridden(settings.user, ...path), [settings.user]);
			const commitScalar = (0, react.useCallback)((path, value) => {
				if (value === null || value === void 0 || value === "") clear(path);
				else write(path, value);
			}, [clear, write]);
			const commitList = (0, react.useCallback)((path, values) => {
				if (values.length === 0) clear(path);
				else write(path, values);
			}, [clear, write]);
			if (settings.status === "unavailable") return null;
			const enabled = config?.enabled ?? true;
			const shaping = config?.resultShaping;
			const archive = config?.archive;
			const shapingEnabled = shaping?.enabled ?? false;
			const archiveEnabled = archive?.enabled ?? true;
			const archiveRoot = archive?.rootPath ?? "";
			const archiveSize = splitBytes(archive?.maxBytes ?? 1073741824);
			const provider = config?.decision?.provider ?? "openai";
			const apiKeyEnv = config?.jev?.apiKeyEnv ?? "TYPESAFE_API_KEY";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardShell, {
				title: "Jev Compaction",
				description: "Semantic result shaping and historical context compaction powered by Jev.",
				badge: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-plugin-card__badge",
					children: badgeText(enabled, shapingEnabled)
				}),
				label: (open) => `${open ? "Hide" : "Show"} settings: Jev Compaction`,
				bodyClassName: "jevc-body",
				children: settings.status === "loading" || config === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "jevc-muted",
					children: "Loading the Jev Compaction configuration…"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "jevc-error",
						role: "alert",
						children: error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "jevc-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "jevc-status",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"Status:",
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "jevc-status-value",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: enabled ? "jevc-status-dot--on" : "jevc-status-dot--off",
												children: "●"
											}),
											" ",
											enabled ? "Enabled" : "Disabled"
										]
									})
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["Provider: ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "jevc-status-value",
									children: provider
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"Model:",
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "jevc-status-value",
										children: config.jev?.model ?? ""
									})
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["Mode: ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "jevc-status-value",
									children: settings.mode
								})] })
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							label: "Enable Jev Compaction",
							description: "Turns semantic context management on or off without uninstalling the plugin.",
							checked: enabled,
							disabled: !writable,
							overridden: overridden(["enabled"]),
							onToggle: (checked) => {
								write(["enabled"], checked);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "jevc-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "jevc-section-title",
								children: "Immediate result shaping"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "jevc-hint",
								children: "Semantically compress large repetitive tool outputs before they are written to conversation history. Runs on the tool-execution path, so the original rendered result is not recoverable from session replay unless the archive below is on."
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
								label: "Shape tool results before they are persisted",
								description: "Off by default: this changes durable model-visible content.",
								checked: shapingEnabled,
								disabled: !writable,
								overridden: overridden(["resultShaping", "enabled"]),
								onToggle: (checked) => {
									write(["resultShaping", "enabled"], checked);
								}
							}),
							shapingEnabled && !archiveEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "jevc-warning",
								role: "status",
								children: "Shaped output may not be recoverable from session replay: the original-output archive is off."
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TagListField, {
								label: "Eligible tools",
								description: "Only these tools may be shaped. Unknown tools are kept unchanged.",
								values: shaping?.includeTools ?? [],
								disabled: !writable,
								overridden: overridden(["resultShaping", "includeTools"]),
								onCommit: (values) => {
									commitList(["resultShaping", "includeTools"], values);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TagListField, {
								label: "Never shape these tools",
								description: "Exclusions win over the eligible list.",
								values: shaping?.excludeTools ?? [],
								placeholder: "add an excluded tool",
								disabled: !writable,
								overridden: overridden(["resultShaping", "excludeTools"]),
								onCommit: (values) => {
									commitList(["resultShaping", "excludeTools"], values);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Minimum result size",
								unit: "characters",
								value: shaping?.thresholdChars ?? 12e3,
								min: 0,
								disabled: !writable,
								overridden: overridden(["resultShaping", "thresholdChars"]),
								onCommit: (value) => {
									commitScalar(["resultShaping", "thresholdChars"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Maximum shaped results per turn",
								value: shaping?.maxPerTurn ?? 2,
								min: 0,
								disabled: !writable,
								overridden: overridden(["resultShaping", "maxPerTurn"]),
								onCommit: (value) => {
									commitScalar(["resultShaping", "maxPerTurn"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
								label: "Preserve errors",
								description: "Keep failed tool results unchanged. Recommended.",
								checked: shaping?.preserveErrors ?? true,
								disabled: !writable,
								overridden: overridden(["resultShaping", "preserveErrors"]),
								onToggle: (checked) => {
									write(["resultShaping", "preserveErrors"], checked);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Minimum savings ratio",
								unit: "(0-1)",
								value: shaping?.minSavingsRatio ?? .3,
								min: 0,
								max: 1,
								step: .05,
								description: "A shaping that saves less than this is discarded.",
								disabled: !writable,
								overridden: overridden(["resultShaping", "minSavingsRatio"]),
								onCommit: (value) => {
									commitScalar(["resultShaping", "minSavingsRatio"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Minimum savings",
								unit: "characters",
								value: shaping?.minSavingsChars ?? 4e3,
								min: 0,
								disabled: !writable,
								overridden: overridden(["resultShaping", "minSavingsChars"]),
								onCommit: (value) => {
									commitScalar(["resultShaping", "minSavingsChars"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "jevc-hint",
								children: [
									"Trigger:",
									" ",
									triggerSummary(shaping?.thresholdChars ?? 12e3, shaping?.minLines ?? 80),
									"."
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "jevc-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "jevc-section-title",
								children: "Original output archive"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "jevc-hint",
								children: "Immediate shaping happens before DSH persists the final tool result. Archiving keeps a local copy of the original rendered output for diagnostics and future recovery."
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
								label: "Archive the original output",
								description: "Save the full rendered result locally before immediate shaping so it can be inspected later.",
								checked: archiveEnabled,
								disabled: !writable,
								overridden: overridden(["archive", "enabled"]),
								onToggle: (checked) => {
									write(["archive", "enabled"], checked);
								}
							}),
							!archiveEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "jevc-warning",
								role: "status",
								children: "Shaped output may not be recoverable from session replay."
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Retention",
								unit: "days (0 = keep)",
								value: archive?.retentionDays ?? 14,
								min: 0,
								disabled: !writable,
								overridden: overridden(["archive", "retentionDays"]),
								onCommit: (value) => {
									commitScalar(["archive", "retentionDays"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Maximum archive size",
								unit: archiveSize.unit,
								value: archiveSize.value,
								min: 0,
								step: .5,
								description: `Currently ${formatBytes(archive?.maxBytes ?? 1073741824)}. 0 disables the size cap.`,
								disabled: !writable,
								overridden: overridden(["archive", "maxBytes"]),
								onCommit: (value) => {
									commitScalar(["archive", "maxBytes"], value === null ? null : toBytes(value, archiveSize.unit));
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
								label: "If archiving fails",
								description: "Fail-open by default: an unarchived result is never shaped.",
								value: archive?.onFailure ?? "keep-original",
								options: ARCHIVE_FAILURE_OPTIONS,
								disabled: !writable,
								overridden: overridden(["archive", "onFailure"]),
								onCommit: (value) => {
									write(["archive", "onFailure"], value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
								label: "Archive root",
								value: archiveRoot,
								placeholder: "default: $DSH_HOME/data/dsh-jev-compaction/originals",
								description: "Absolute path, or empty for the harness home. Changing it needs a restart.",
								disabled: !writable,
								overridden: overridden(["archive", "rootPath"]),
								onCommit: (value) => {
									commitScalar(["archive", "rootPath"], value);
								}
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "jevc-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "jevc-section-title",
								children: "Historical compaction"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "jevc-hint",
								children: "When context grows, semantically prune stale historical tool results before falling back to ordinary summary compaction."
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Start semantic pruning at",
								unit: "% of model context",
								value: Math.round((config.trigger?.contextRatio ?? .7) * 100),
								min: 0,
								max: 100,
								disabled: !writable,
								overridden: overridden(["trigger", "contextRatio"]),
								onCommit: (value) => {
									commitScalar(["trigger", "contextRatio"], value === null ? null : value / 100);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Minimum surface tokens",
								value: config.trigger?.minSurfaceTokens ?? 32e3,
								min: 1,
								disabled: !writable,
								overridden: overridden(["trigger", "minSurfaceTokens"]),
								onCommit: (value) => {
									commitScalar(["trigger", "minSurfaceTokens"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Preserve recent messages",
								value: config.preserve?.recentMessages ?? 6,
								min: 0,
								disabled: !writable,
								overridden: overridden(["preserve", "recentMessages"]),
								onCommit: (value) => {
									commitScalar(["preserve", "recentMessages"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Preserve recent tokens",
								value: config.preserve?.recentTokens ?? 12e3,
								min: 0,
								disabled: !writable,
								overridden: overridden(["preserve", "recentTokens"]),
								onCommit: (value) => {
									commitScalar(["preserve", "recentTokens"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Full-keep threshold",
								unit: "(0-1)",
								value: config.decisions?.fullThreshold ?? .7,
								min: 0,
								max: 1,
								step: .05,
								description: "Above this retention score a result stays full.",
								disabled: !writable,
								overridden: overridden(["decisions", "fullThreshold"]),
								onCommit: (value) => {
									commitScalar(["decisions", "fullThreshold"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
								label: "Truncate threshold",
								unit: "(0-1)",
								value: config.decisions?.truncateThreshold ?? .45,
								min: 0,
								max: 1,
								step: .05,
								description: "Above this a result keeps a truncated head and tail instead of a stub.",
								disabled: !writable,
								overridden: overridden(["decisions", "truncateThreshold"]),
								onCommit: (value) => {
									commitScalar(["decisions", "truncateThreshold"], value);
								},
								onInvalid: (text) => {
									setError(rangeError(text));
								}
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "jevc-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "jevc-section-title",
								children: "Decision backend"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "jevc-hint",
								children: "Scoring backend for semantic retention. Use openai for any OpenAI-compatible chat API, or a System One endpoint."
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
								label: "Provider",
								value: provider,
								options: PROVIDER_OPTIONS,
								disabled: !writable,
								overridden: overridden(["decision", "provider"]),
								onCommit: (value) => {
									write(["decision", "provider"], value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
								label: "Endpoint",
								value: config.jev?.baseUrl ?? "",
								placeholder: "https://api.openai.com/v1",
								disabled: !writable,
								overridden: overridden(["jev", "baseUrl"]),
								onCommit: (value) => {
									commitScalar(["jev", "baseUrl"], value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
								label: "Model",
								value: config.jev?.model ?? "",
								disabled: !writable,
								overridden: overridden(["jev", "model"]),
								onCommit: (value) => {
									commitScalar(["jev", "model"], value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
								label: "API key environment variable",
								value: apiKeyEnv,
								placeholder: "TYPESAFE_API_KEY",
								description: "Only the variable name is stored and shown. The key itself is read on the Host and never reaches this page.",
								disabled: !writable,
								overridden: overridden(["jev", "apiKeyEnv"]),
								onCommit: (value) => {
									commitScalar(["jev", "apiKeyEnv"], value);
								}
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "jevc-details",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: "Advanced" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "jevc-details-body",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
									label: "Request timeout",
									unit: "ms",
									value: config.jev?.timeoutMs ?? 2500,
									min: 500,
									max: 6e4,
									disabled: !writable,
									overridden: overridden(["jev", "timeoutMs"]),
									onCommit: (value) => {
										commitScalar(["jev", "timeoutMs"], value);
									},
									onInvalid: (text) => {
										setError(rangeError(text));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
									label: "Concurrent Jev requests",
									value: config.jev?.maxConcurrency ?? 4,
									min: 1,
									max: 8,
									disabled: !writable,
									overridden: overridden(["jev", "maxConcurrency"]),
									onCommit: (value) => {
										commitScalar(["jev", "maxConcurrency"], value);
									},
									onInvalid: (text) => {
										setError(rangeError(text));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
									label: "Jev state token ceiling",
									value: config.state?.maxStateTokens ?? 25e3,
									min: 1e3,
									disabled: !writable,
									overridden: overridden(["state", "maxStateTokens"]),
									onCommit: (value) => {
										commitScalar(["state", "maxStateTokens"], value);
									},
									onInvalid: (text) => {
										setError(rangeError(text));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
									label: "Head lines kept per shaped result",
									value: shaping?.keepHeadLines ?? 8,
									min: 0,
									disabled: !writable,
									overridden: overridden(["resultShaping", "keepHeadLines"]),
									onCommit: (value) => {
										commitScalar(["resultShaping", "keepHeadLines"], value);
									},
									onInvalid: (text) => {
										setError(rangeError(text));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
									label: "Tail lines kept per shaped result",
									value: shaping?.keepTailLines ?? 12,
									min: 0,
									disabled: !writable,
									overridden: overridden(["resultShaping", "keepTailLines"]),
									onCommit: (value) => {
										commitScalar(["resultShaping", "keepTailLines"], value);
									},
									onInvalid: (text) => {
										setError(rangeError(text));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
									label: "Minimum classification confidence",
									unit: "(0-1)",
									value: shaping?.minClassificationConfidence ?? .6,
									min: 0,
									max: 1,
									step: .05,
									description: "Below this the group is kept.",
									disabled: !writable,
									overridden: overridden(["resultShaping", "minClassificationConfidence"]),
									onCommit: (value) => {
										commitScalar(["resultShaping", "minClassificationConfidence"], value);
									},
									onInvalid: (text) => {
										setError(rangeError(text));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectField, {
									label: "Log level",
									value: config.diagnostics?.logLevel ?? "info",
									options: LOG_LEVEL_OPTIONS,
									disabled: !writable,
									overridden: overridden(["diagnostics", "logLevel"]),
									onCommit: (value) => {
										write(["diagnostics", "logLevel"], value);
									}
								})
							]
						})]
					}),
					writable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "jevc-hint",
						children: "This profile exposes the settings read-only."
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "jevc-actions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "jevc-button",
							disabled: !writable || overrides.length === 0,
							onClick: resetAll,
							children: [
								"Reset overrides (",
								overrides.length,
								")"
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "jevc-hint",
						children: "Changes are written to the Host settings service as they are made and apply to the running plugin without a restart."
					})
				] })
			});
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* Card CSS: the canonical shell (from the shared kit, so every first-party
		* card renders an identical outer surface) plus this plugin's body rules.
		* Only `--dsw-alias-*` design tokens are used: an unknown token invalidates
		* the whole declaration in the host page, so a typo would silently drop the
		* rule instead of failing loudly.
		*/
		const styles = `${PLUGIN_CARD_SHELL_CSS}${String.raw`
.jevc-body{display:flex;flex-direction:column;gap:14px;padding-top:12px}
.jevc-section{display:flex;flex-direction:column;gap:8px}
.jevc-section-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.4}
.jevc-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin:0}
.jevc-row{display:flex;align-items:flex-start;gap:12px}
.jevc-row-text{display:flex;flex-direction:column;flex:1;gap:2px;min-width:0}
.jevc-row-label{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.4}
.jevc-row-description{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.jevc-field{display:flex;flex-direction:column;gap:4px}
.jevc-field-label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.4}
.jevc-input{appearance:none;width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:13px;padding:6px 8px}
.jevc-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.jevc-input:disabled{color:var(--dsw-alias-label-dimmed)}
.jevc-input--number{max-width:140px}
.jevc-inline{display:flex;align-items:center;gap:8px}
.jevc-unit{color:var(--dsw-alias-label-tertiary);font-size:12px}
.jevc-toggle{appearance:none;position:relative;flex:none;width:34px;height:20px;margin:2px 0 0;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;cursor:pointer;transition:background .16s,border-color .16s}
.jevc-toggle::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;background:var(--dsw-alias-label-secondary);border-radius:999px;transition:transform .16s,background .16s}
.jevc-toggle:checked{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.jevc-toggle:checked::after{background:var(--dsw-alias-label-primary-foreground);transform:translateX(14px)}
.jevc-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.jevc-toggle:disabled{cursor:default;opacity:.5}
.jevc-tags{display:flex;flex-wrap:wrap;gap:6px}
.jevc-tag{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 8px;font-size:12px;line-height:17px}
.jevc-tag-remove{appearance:none;color:inherit;cursor:pointer;background:0 0;border:0;font:inherit;font-size:13px;line-height:1;padding:0}
.jevc-tag-remove:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.jevc-empty{color:var(--dsw-alias-label-tertiary);font-size:12px}
.jevc-chip{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.jevc-error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;font-size:12px;line-height:1.5;padding:8px 10px}
.jevc-warning{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font-size:12px;line-height:1.5;padding:8px 10px}
.jevc-status{display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.jevc-status-value{color:var(--dsw-alias-label-secondary)}
.jevc-status-dot--on{color:var(--dsw-alias-state-success-primary)}
.jevc-status-dot--off{color:var(--dsw-alias-state-error-primary)}
.jevc-actions{display:flex;justify-content:flex-end;gap:8px}
.jevc-button{appearance:none;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:12px;padding:5px 10px}
.jevc-button:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}
.jevc-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.jevc-button:disabled{cursor:default;color:var(--dsw-alias-label-dimmed)}
.jevc-details{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 10px}
.jevc-details>summary{color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;line-height:1.5;padding:8px 0}
.jevc-details[open]>summary{color:var(--dsw-alias-label-primary)}
.jevc-details-body{display:flex;flex-direction:column;gap:10px;padding-bottom:10px}
.jevc-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin:0}
`}`;
		//#endregion
		//#region src/client/index.tsx
		/** Package name: the style-tag key and the card's own plugin identity. */
		const CLIENT_PLUGIN_NAME = "dsh-jev-compaction";
		/**
		* Client services this module reads. The client runtime resolves only
		* declared dependencies, so they must be listed here as well as in the
		* `dsh.client.inject` manifest.
		*/
		const inject = ["slots", "configForms"];
		function noop() {}
		/** Bind the settings namespace and register the native settings card. */
		function apply(ctx) {
			const face = ctx;
			const forms = face.configForms;
			if (forms === void 0 || typeof forms.get !== "function" || face.slots === void 0) return noop;
			const scope = forms.get("dsh-jev-compaction");
			return registerSettingsCard(face, {
				key: JEV_COMPACTION_SETTINGS_NAMESPACE,
				pluginName: CLIENT_PLUGIN_NAME,
				styles,
				component: JevCompactionCard,
				inject: () => ({ scope })
			});
		}
		//#endregion
		exports.CLIENT_PLUGIN_NAME = CLIENT_PLUGIN_NAME;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map