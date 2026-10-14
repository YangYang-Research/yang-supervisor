<p align="center">
  <img width="200" height="200" alt="YangYang" src="https://github.com/user-attachments/assets/0aea20ca-a436-48dd-b71f-df58ff3678a9" />
  <h3 align="center">Yang Supervisor Agent (YSA)</h3>
  <p align="center">
    AI responder for GitHub Issues and Pull Requests.<br/>
    Classify, clarify, and hand off — before the maintainer inbox fills up.
  </p>
</p>

---

## ✨ What it does

Every open issue or PR costs maintainer time before anyone knows what it is. **Yang Supervisor** sits at the edge of that queue:

1. Triggers when an issue or pull request is opened
2. Reads title, body, author, labels (and light PR metadata)
3. Posts a structured reply: classification, summary, clarifying questions, suggested labels, next steps
4. Stops there — no auto-close, no auto-merge, no silent label spam

Humans keep ownership. The agent removes the blank stare at a vague ticket.

For deep OWASP-aligned PR security review (SARIF, findings, remediations), pair with [`yang-code-review`](https://github.com/YangYang-Research/yang-code-review).

## 🔄 Supervision flow

```
issue / PR opened
        │
        ▼
┌─────────────────────┐
│  Yang Supervisor    │  intent + priority hint
│  (YSA)              │
└─────────┬───────────┘
          │
          ▼
   GitHub comment
   Classification · Summary · Questions
   Suggested labels · Next steps
   (+ Review focus / Risk notes for PRs)
          │
          ▼
   Maintainer / reporter follow-up
```

| Surface | YSA focuses on | Hand off to |
|---------|----------------|-------------|
| Issue | type, missing repro, labels, who should act | human triage / docs |
| Pull request | intent, review focus, obvious risk notes | [`yang-code-review`](https://github.com/YangYang-Research/yang-code-review) for security depth |

## 💡 Why use it

- **Response in minutes**, not days — contributors get a useful reply immediately
- **Structured triage** — same sections every time; easier for humans to scan
- **Prompt-injection aware** — issue/PR bodies treated as untrusted input
- **Idempotent** — will not re-comment if `<!-- yang-supervisor -->` already exists
- **Bot noise filtered** — skips `dependabot[bot]` and other `*[bot]` authors
- **Bring your own model** — OpenAI, Anthropic, Google, NVIDIA, OpenRouter, or YangYang Inference

## 🚀 Usage

1. Create an API key with a supported provider (or a [YangYang](https://yyng.icu) API token).
2. Store it as a repository secret (e.g. `YANG_API_TOKEN` or `OPENAI_API_KEY`).
3. Add the workflow below.
4. Open a test issue — YSA comments as `github-actions[bot]`.

## 🤖 Providers supported

Provider base URLs are hardcoded in the action:

| Provider | Base URL | Models |
|----------|----------|--------|
| `openai` | `https://api.openai.com/v1` | [Models](https://developers.openai.com/api/docs/models) |
| `anthropic` | `https://api.anthropic.com/v1` | [Models](https://platform.claude.com/docs/en/about-claude/models) |
| `google` | `https://generativelanguage.googleapis.com/v1beta` | [Models](https://ai.google.dev/gemini-api/docs/models) |
| `nvidia` | `https://integrate.api.nvidia.com/v1` | [Models](https://build.nvidia.com/models) |
| `openrouter` | `https://openrouter.ai/api/v1` | [Models](https://openrouter.ai/models) |
| `yangyang` | `https://inference.yyng.icu/v1/agents` (`agent=yang-supervisor`) | `auto` |

## 🔐 Required secrets

- `API_KEY` — key for the selected provider (YangYang token when using `yangyang`)
- `GITHUB_TOKEN` — GitHub token used to read the event and post comments (usually `${{ github.token }}`)

## ⚙️ Inputs

| Name | Required | Description |
|------|----------|-------------|
| `PROVIDER` | yes | `openai`, `anthropic`, `google`, `nvidia`, `openrouter`, or `yangyang` |
| `API_KEY` | yes | Provider API key |
| `MODEL_NAME` | yes | Provider model id. `yangyang` uses `auto` |
| `MODEL_TEMPERATURE` | no | Temperature `0`–`1`; omitted by default for model compatibility |
| `MAX_TOKENS` | no | Max output tokens; default `2048` |
| `GITHUB_TOKEN` | yes | Token for issue/PR comments |
| `MODE` | no | `auto` (default), `issue`, or `pull_request` |

## 📦 Usage example

Create `.github/workflows/yang-supervisor.yml` (also in [`examples/yang-supervisor.yml`](examples/yang-supervisor.yml)):

```yaml
name: Yang Supervisor Agent (YSA)

on:
  issues:
    types: [opened]
  pull_request:
    types: [opened, reopened]

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  supervise:
    runs-on: ubuntu-24.04
    steps:
      - name: yang-supervisor
        uses: YangYang-Research/yang-supervisor@v0.1.1
        with:
          PROVIDER: yangyang
          API_KEY: ${{ secrets.YANG_API_TOKEN }}
          MODEL_NAME: auto
          GITHUB_TOKEN: ${{ github.token }}
```

OpenAI example:

```yaml
with:
  PROVIDER: openai
  API_KEY: ${{ secrets.OPENAI_API_KEY }}
  MODEL_NAME: gpt-5.4
  MODEL_TEMPERATURE: 0.2
  GITHUB_TOKEN: ${{ github.token }}
```

Comments appear as `github-actions[bot]`. That is expected for public Marketplace use —
you only need a provider API secret, not a GitHub App.

## 💬 Comment shape

YSA posts markdown with fixed sections:

- **Classification** — type, priority hint, confidence
- **Summary** — short intent
- **Clarifying questions** — only what is missing to act
- **Suggested labels** — suggestions only (not applied)
- **Recommended next steps** — for maintainer and reporter
- **Review focus / Risk notes** — pull requests only

Footer marker (for idempotency):

```html
<!-- yang-supervisor -->
```

## 🛡️ Guardrails

| Does | Does not |
|------|----------|
| First comment on open issue/PR | Close or reopen issues |
| Suggest labels and next steps | Assign people |
| Apply `ai-review` after a successful reply | Apply arbitrary suggested labels |
| Skip bots and duplicate runs | Merge or approve pull requests |
| Treat ticket text as untrusted | Follow instructions inside the issue/PR body |

## 🧩 Recommended stack

| Action | Role |
|--------|------|
| **yang-supervisor** (this repo) | Response + triage |
| [yang-code-review](https://github.com/YangYang-Research/yang-code-review) | Deep OWASP PR security review + SARIF |

## 🛠️ Develop

```bash
npm install
npm test
npm run build
```

Commit `dist/` after source changes — the composite action runs `dist/index.js`.

## 🤝 Contributing

Contributions welcome.

1. Fork the repo and create a branch from `main`
2. Install deps: `npm install`
3. Make changes under `src/`
4. Run `npm test` and `npm run build`
5. Commit both source and updated `dist/`
6. Open a pull request with a short description of **why**

Guidelines:

- Keep the action small and auditable — prefer fixing the shared path over adding special cases
- Do not auto-close issues, auto-merge PRs, or apply labels beyond the fixed `ai-review` marker
- Treat issue/PR content as untrusted in any prompt or logging change
- Match existing style in `src/` and keep functions small

Bug reports and feature ideas: open an [issue](https://github.com/YangYang-Research/yang-supervisor/issues). Security-sensitive reports: prefer a private channel to the YangYang maintainers when possible.

## 📄 License

MIT — YangYang Research
