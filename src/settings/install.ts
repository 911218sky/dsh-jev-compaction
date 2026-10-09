/**
 * Host-side settings wiring for the plugin.
 *
 * DSH 0.2 replaced `settings.installSection` / SettingsScope with SettingsForms
 * over the cordis profile entry (`dsh-jev-compaction`). Live values come from
 * `settings.describe()`; composition `entryConfig` is the fallback base layer.
 * The browser card joins the same entry through `configForms.get(entryId)`.
 *
 * Older hosts that still expose `installSection` keep that path.
 */

import type { Context } from "@deepseek-ai/cordis";

import type { JevCompactionConfig } from "../config.js";
import { JEV_COMPACTION_ENTRY_ID } from "../shared/settings.js";

/** Structural view of the host settings service (0.2 SettingsForms + legacy). */
export interface SettingsInstallFace {
  installSection?(
    owner: Context,
    namespace: string,
    schema: unknown,
    entry: unknown,
    hooks: {
      setSource(current: () => unknown): void;
      onChange(): void;
      validate?(value: unknown): void;
    },
  ): void;
  configure?(
    presentation: { auto?: boolean },
    owner?: unknown,
  ): () => void;
  describe?(): Array<{
    ns: string;
    value?: unknown;
    user?: unknown;
    revision?: number;
  }>;
}

/** Structural view of the injecting context. */
export interface SettingsInjectedContext {
  settings?: SettingsInstallFace;
}

/** The host plugin face the installer needs. */
export interface SettingsInstallTarget {
  /** Context the plugin was mounted on; the section is registered on it. */
  readonly owner: Context;
  /** The composition entry: the base layer under every user override. */
  readonly entryConfig: JevCompactionConfig;
  /** Schema resolved by the settings service for this namespace. */
  readonly schema: unknown;
  /** Adopt the settings-driven source (or the entry when it detaches). */
  readonly setSource: (current: () => JevCompactionConfig) => void;
  /** Re-resolve and re-apply after an attach, detach or committed change. */
  readonly onChange: () => void;
  /** Reject values the schema cannot express before they are persisted. */
  readonly validate?: (value: JevCompactionConfig) => void;
}

/**
 * Read the merged SettingsForms document for this plugin's cordis entry.
 * Falls back to the composition entry when describe is missing or empty.
 */
export function readLiveJevConfig(
  settings: SettingsInstallFace | undefined,
  fallback: JevCompactionConfig,
): JevCompactionConfig {
  const descriptor = settings
    ?.describe?.()
    .find((entry) => entry.ns === JEV_COMPACTION_ENTRY_ID);
  const value = descriptor?.value;
  if (value !== undefined && typeof value === "object" && value !== null) {
    return value as JevCompactionConfig;
  }
  return fallback;
}

/**
 * Install live settings for DSH 0.2 SettingsForms: presentation + describe()
 * as the config source + reapply on `settings/document-updated`.
 */
function installSettingsForms(
  target: SettingsInstallTarget,
  settings: SettingsInstallFace,
): void {
  if (typeof settings.configure === "function") {
    target.owner.effect(
      () => settings.configure!({ auto: true }, target.owner.fiber),
      "dsh-jev-compaction: settings presentation",
    );
  }

  target.setSource(() => readLiveJevConfig(settings, target.entryConfig));
  target.onChange();

  const events = target.owner as unknown as {
    on?(event: string, handler: (ns: unknown) => void): () => void;
  };
  if (typeof events.on !== "function") return;
  target.owner.effect(() => {
    const stop = events.on!("settings/document-updated", (ns) => {
      if (String(ns) === JEV_COMPACTION_ENTRY_ID) target.onChange();
    });
    return stop;
  }, "dsh-jev-compaction: settings watch");
}

/**
 * Install the plugin's settings section. Safe when the host exposes no
 * settings service (older profiles, headless probes): the plugin keeps
 * running on its composition config.
 */
export function installJevCompactionSettings(
  target: SettingsInstallTarget,
): void {
  target.owner.inject(["settings"], (injected) => {
    const settings = (injected as SettingsInjectedContext).settings;
    if (settings === undefined) return;

    // DSH 0.2+: SettingsForms over the cordis entry (no installSection).
    if (typeof settings.installSection !== "function") {
      installSettingsForms(target, settings);
      return;
    }

    settings.installSection(
      target.owner,
      JEV_COMPACTION_ENTRY_ID,
      target.schema,
      target.entryConfig,
      {
        setSource: (current) => {
          target.setSource(current as () => JevCompactionConfig);
        },
        onChange: () => {
          target.onChange();
        },
        ...(target.validate === undefined
          ? {}
          : {
              validate: (value: unknown) =>
                target.validate?.(value as JevCompactionConfig),
            }),
      },
    );
  });
}
