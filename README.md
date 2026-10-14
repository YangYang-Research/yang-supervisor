<p align="center">
  <h3 align="center">Yang Supervisor Agent (YSA)</h3>
  <p align="center">First-response triage for GitHub Issues and Pull Requests.</p>
</p>

---

When someone opens an issue or PR, Yang Supervisor classifies it, summarizes intent, asks clarifying questions, suggests labels, and posts recommended next steps — before a human maintainer replies.

For deep OWASP-aligned PR security review, pair with [`yang-code-review`](https://github.com/YangYang-Research/yang-code-review).

## Usage

1. Create an API key with a supported provider (or a YangYang token).
2. Save it as a repository secret.
3. Add the workflow below.

## Providers

| Provider | Notes |
|----------|--------|
| `yangyang` | `POST https://inference.yyng.icu/v1/agents` with `agent=yang-supervisor`, `MODEL_NAME: auto` |
| `openai` / `anthropic` / `google` / `nvidia` / `openrouter` | Direct provider APIs; system prompt from this action |

## Required secrets

- `API_KEY` — provider key or YangYang API token
- `GITHUB_TOKEN` — usually `${{ github.token }}`

## Example workflow

Create `.github/workflows/yang-supervisor.yml`:

```yaml
name: Yang Supervisor Agent

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
        uses: YangYang-Research/yang-supervisor@v0.1.0
        with:
          PROVIDER: yangyang
          API_KEY: ${{ secrets.YANG_API_KEY }}
          MODEL_NAME: auto
          GITHUB_TOKEN: ${{ github.token }}
```

## Inputs

| Name | Required | Description |
|------|----------|-------------|
| `PROVIDER` | yes | `openai`, `anthropic`, `google`, `nvidia`, `openrouter`, or `yangyang` |
| `API_KEY` | yes | Provider API key |
| `MODEL_NAME` | yes | Model id; `yangyang` uses `auto` |
| `MODEL_TEMPERATURE` | no | `0`–`1` |
| `MAX_TOKENS` | no | Default `2048` |
| `GITHUB_TOKEN` | yes | Token for comments |
| `MODE` | no | `auto` (default), `issue`, or `pull_request` |

## Behavior

- Idempotent: skips if a comment already contains `<!-- yang-supervisor -->`
- Skips bot authors (`dependabot[bot]`, `*[bot]`)
- Does **not** close issues, merge PRs, or apply labels automatically (suggestions only)

## Develop

```bash
npm install
npm run build
```

## License

MIT
