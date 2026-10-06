/**
 * Browser entry of the Jev Compaction settings card.
 *
 * Binds the plugin's settings namespace and registers the card in the shared
 * `settings.plugin.item` slot via DSH SettingsForm primitives — no plugin-kit
 * CSS or immediate-write controls.
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "./slots.js";

import { JEV_COMPACTION_SETTINGS_NAMESPACE } from "../shared/settings.js";
import {
  flatSettingsFormScope,
  type ConfigFormLike,
} from "./config-form-adapter.js";
import type { JevCompactionConfig } from "../config.js";
import { JevCompactionCard } from "./JevCompactionCard.js";
import {
  JevCompactionCardController,
  JEV_COMPACTION_ENTRY_ID,
} from "./jev-card-controller.js";

/** Required services (cordis fiber inject). */
export const inject = ["slots", "configForms"] as const;

/** Structural view of the client services this entry needs. */
interface ClientFace {
  slots: {
    inject(slotName: string, factory: () => unknown): () => void;
    register(options: unknown, component: unknown): () => void;
  };
  configForms?: {
    get(entryId: string): ConfigFormLike<JevCompactionConfig> | undefined;
  };
}

/** Bind the settings namespace and register the settings card. */
export function apply(ctx: Context): void {
  const face = ctx as unknown as ClientFace;
  const form = face.configForms?.get?.(JEV_COMPACTION_ENTRY_ID);
  if (form === undefined || face.slots === undefined) return;

  const controller = new JevCompactionCardController(flatSettingsFormScope(form));
  ctx.effect(
    () => () => controller.dispose(),
    "dsh-jev-compaction: card controller lifetime",
  );

  face.slots.inject("settings.plugin.item", function* () {
    yield face.slots.register(
      {
        name: "settings.plugin.item",
        key: JEV_COMPACTION_SETTINGS_NAMESPACE,
        inject: () => controller.inject(),
      },
      JevCompactionCard,
    );
  });
}
