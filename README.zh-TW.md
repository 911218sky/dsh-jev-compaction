# dsh-jev-compaction

給 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的**過期工具結果語意裁剪**：對話文字保持原文；在一般摘要壓縮之前，可縮短過期的 `tool/result`。

[English README](./README.md)

改編自 [xarleyn/dsh-plugins → dsh-jev-compaction](https://github.com/xarleyn/dsh-plugins/tree/main/plugins/dsh-jev-compaction)。完整出處見 [NOTICE.md](./NOTICE.md)（另含 Tamara Tran / fast-jev-compaction、zhangxaochen/dsh-jev）。

---

## 何時使用

長會話會堆滿過期的 shell／搜尋／讀檔輸出。本外掛會評分這些結果是否仍需要，並透過 DSH surface 替換過期節點（原始事件仍留在 session log）。

---

## 決策後端（建議：TypeSafe Jev）

使用託管的 **TypeSafe System One**（[介紹](https://docs.typesafe.ai/introduction)、[快速開始](https://docs.typesafe.ai/introduction/quickstart)）。Jev 對 state 做 typed questions，直接回傳結構化答案 — 見 [models](https://docs.typesafe.ai/models)（`jev-latest` 對應現行穩定版）。

1. 在 [TypeSafe dashboard](https://docs.typesafe.ai/introduction/quickstart) 建立 API key。
2. 放到環境變數 `TYPESAFE_API_KEY`（不要進 Git）。
3. 外掛設定對準官方 System One endpoint：

```yaml
decision:
  provider: typesafe
  typesafe:
    baseUrl: https://api.typesafe.ai/v1/systemone
    apiKeyEnv: TYPESAFE_API_KEY
    model: jev-latest
```

對應官方呼叫：

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### 其他 provider

| `decision.provider` | 協定 | 用途 |
| --- | --- | --- |
| **`typesafe`** | System One | TypeSafe 託管 Jev（建議） |
| `jeff` | System One | 自架 Jeff |
| `custom` | System One | 自有 `/v1/systemone` |
| `openai` | OpenAI 相容 `…/v1/chat/completions` | 其他 chat 閘道 |

`openai` 需自設 `baseUrl` / `apiKeyEnv` / `model`。一般生成模型走 JSON 評分；模型 id 含 `this-that` 時走 yes/no **choice**。

---

## 需求

- **Node.js LTS**（`engines`: `>=20`；請使用你維護中的現行 Active LTS）
- DSH web profile **0.1.7-rc.2+**
- 使用建議的 `typesafe` 時需設定 `TYPESAFE_API_KEY`

---

## 安裝

```bash
dsh plugin --profile web add github:911218sky/dsh-jev-compaction#main
# 設定 TYPESAFE_API_KEY 後重啟 dsh-web
```

---

## 授權

MIT — 見 [LICENSE](./LICENSE)、[NOTICE.md](./NOTICE.md)。
