# dsh-jev-compaction

Semantic pruning of **stale tool results** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Conversation text stays verbatim; old `tool/result` surfaces can be shortened **before** ordinary summary compaction.

[繁體中文說明](./README.zh-TW.md)

Based on / adapted from [xarleyn/dsh-plugins → dsh-jev-compaction](https://github.com/xarleyn/dsh-plugins/tree/main/plugins/dsh-jev-compaction). See [NOTICE.md](./NOTICE.md) for full attribution (also Tamara Tran / fast-jev-compaction and zhangxaochen/dsh-jev).

---

## When to use

Long sessions fill the context with outdated shell logs, searches, and file dumps. This plugin scores whether those results are still needed and replaces stale ones via DSH surface ops (original events remain in the session log).

---

## Decision backend (recommended: TypeSafe Jev)

Use hosted **TypeSafe System One** ([docs](https://docs.typesafe.ai/introduction), [quick start](https://docs.typesafe.ai/introduction/quickstart)). Jev evaluates typed questions against a state and returns structured answers — see [models](https://docs.typesafe.ai/models) (`jev-latest` → current stable).

1. Create an API key in the [TypeSafe dashboard](https://docs.typesafe.ai/introduction/quickstart).
2. Put it in `TYPESAFE_API_KEY` (never in git).
3. Point the plugin at the official System One endpoint:

```yaml
# cordis / plugin config (keys stay in the environment)
decision:
  provider: typesafe
  typesafe:
    baseUrl: https://api.typesafe.ai/v1/systemone
    apiKeyEnv: TYPESAFE_API_KEY
    model: jev-latest
```

That matches the official wire call:

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### Other providers

| `decision.provider` | Wire protocol | Typical use |
| --- | --- | --- |
| **`typesafe`** | System One | Hosted TypeSafe Jev (recommended) |
| `jeff` | System One | Self-hosted Jeff |
| `custom` | System One | Your own `/v1/systemone` |
| `openai` | OpenAI-compatible `…/v1/chat/completions` | Alternate chat gateways |

For `openai`, set `decision.openai.baseUrl` / `apiKeyEnv` / `model`. Generative models use a JSON scoring prompt; model ids containing `this-that` use a yes/no **choice** schema.

---

## Requirements

- **Node.js LTS** (`engines`: `>=20`; run the current Active LTS you maintain)
- DSH web profile **0.1.7-rc.2+**
- `TYPESAFE_API_KEY` when using the recommended `typesafe` provider

---

## Install

```bash
dsh plugin --profile web add github:911218sky/dsh-jev-compaction#main
# export TYPESAFE_API_KEY=… then restart dsh-web
```

Or add to `$DSH_HOME/profiles/web/package.json` dependencies / `dsh.profile.bundles`, install, restart.

---

## Safety

Fail-open: missing keys, timeouts, or bad responses skip pruning and leave normal DSH compaction alone. Historical replacements are replay-safe surface shadows. Immediate result-shaping stays **off** by default.

---

## Develop

```bash
npm install
npm run build
```

---

## License

MIT — see [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md).
