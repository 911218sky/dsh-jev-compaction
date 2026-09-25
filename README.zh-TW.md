# dsh-jev-compaction

給 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的**過期工具結果語意裁剪**：對話文字保持原文；在一般摘要壓縮之前，可縮短過期的 `tool/result`。

[English README](./README.md)

改編自 [xarleyn/dsh-plugins → dsh-jev-compaction](https://github.com/xarleyn/dsh-plugins/tree/main/plugins/dsh-jev-compaction)。完整出處見 [NOTICE.md](./NOTICE.md)（另含 Tamara Tran / fast-jev-compaction、zhangxaochen/dsh-jev）。

---

## 何時使用

長會話會堆滿過期的 shell／搜尋／讀檔輸出。本外掛會評分這些結果是否仍需要，並透過 DSH surface 替換過期節點（原始事件仍留在 session log）。

---

## 決策後端

| `decision.provider` | 協定 | 用途 |
| --- | --- | --- |
| **`openai`（預設）** | OpenAI 相容 `…/v1/chat/completions` | 任意閘道：OpenAI、FLock、LiteLLM、vLLM、EasyTokens… |
| `typesafe` | System One | TypeSafe 託管 Jev |
| `jeff` | System One | 自架 Jeff |
| `custom` | System One | 自有 `/v1/systemone` |

`openai` 說明：

- API key 只放**環境變數**（不要進 Git）。預設變數名 `OPENAI_API_KEY`（可用 `decision.openai.apiKeyEnv` 改）。
- `baseUrl` 填閘道的 `…/v1`，`model` 填該閘道的模型 id。
- 一般生成模型走 JSON 評分 prompt。
- 模型 id 含 `this-that` 時走 **choice**（yes/no）並用回傳機率當分數（例如 FLock 的 `this-that-model-1.2` 這類選擇模型）。

```yaml
decision:
  provider: openai
  openai:
    baseUrl: https://api.example.com/v1
    apiKeyEnv: OPENAI_API_KEY
    model: your-model-id
```

---

## 需求

- **Node.js LTS**（`engines`: `>=20`；請使用你維護中的現行 Active LTS）
- DSH web profile **0.1.7-rc.2+**

---

## 安裝

```bash
dsh plugin --profile web add github:911218sky/dsh-jev-compaction#main
# 設定 apiKeyEnv 對應的環境變數後重啟 dsh-web
```

---

## 授權

MIT — 見 [LICENSE](./LICENSE)、[NOTICE.md](./NOTICE.md)。
