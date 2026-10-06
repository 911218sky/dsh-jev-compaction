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
export const JEV_COMPACTION_ENTRY_ID = "dsh-jev-compaction";

/** @deprecated Prefer {@link JEV_COMPACTION_ENTRY_ID}; kept as an alias. */
export const JEV_COMPACTION_SETTINGS_NAMESPACE = JEV_COMPACTION_ENTRY_ID;
