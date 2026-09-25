# dsh-jev-compaction

Semantic pruning of **stale tool results** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Conversation text stays verbatim; old `tool/result` surfaces can be shortened **before** ordinary summary compaction.

[繁體中文說明](./README.zh-TW.md)

Based on / adapted from [xarleyn/dsh-plugins → dsh-jev-compaction](https://github.com/xarleyn/dsh-plugins/tree/main/plugins/dsh-jev-compaction). See [NOTICE.md](./NOTICE.md) for full attribution (also Tamara Tran / fast-jev-compaction and zhangxaochen/dsh-jev).

---

## When to use

Long sessions fill the context with outdated shell logs, searches, and file dumps. This plugin scores whether those results are still needed and replaces stale ones via DSH surface ops (original events remain in the session log).

---

## Decision backends

| `decision.provider` | Wire protocol | Typical use |
| --- | --- | --- |
| **`openai` (default)** | OpenAI-compatible `…/v1/chat/completions` | Any gateway: OpenAI, LiteLLM, vLLM, EasyTokens, … |
| `typesafe` | System One | Hosted TypeSafe Jev |
| `jeff` | System One | Self-hosted Jeff |
| `custom` | System One | Your own `/v1/systemone` |

For `openai`:

- Put the API key in an **environment variable** (never in git). Default name: `OPENAI_API_KEY` (override with `decision.openai.apiKeyEnv`).
- Set `decision.openai.baseUrl` to the gateway’s `…/v1` root and `decision.openai.model` to that gateway’s model id.
- Generative chat models use a JSON scoring prompt.
- Models whose id contains `this-that` use a **choice** schema (`yes`/`no`) and map returned probabilities to scores.

Example (any OpenAI-compatible host):

```yaml
# cordis / plugin config (keys stay in the environment)
decision:
  provider: openai
  openai:
    baseUrl: https://api.example.com/v1
    apiKeyEnv: OPENAI_API_KEY
    model: your-model-id
```

---

## Requirements

- **Node.js LTS** (`engines`: `>=20`; run the current Active LTS you maintain)
- DSH web profile **0.1.7-rc.2+**
- Optional: System One key vars if you use `typesafe` / `jeff` / `custom`

---

## Install

```bash
dsh plugin --profile web add github:911218sky/dsh-jev-compaction#main
# set the env var named by apiKeyEnv, then restart dsh-web
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
