/**
 * Client-side slot declarations for the dsh-jev-compaction card.
 */

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    /** One plugin card inside the settings plugin section. */
    "settings.plugin.item": {
      kind: "keyed";
      scope: "root";
      owner: { children?: never };
    };
  }
}
