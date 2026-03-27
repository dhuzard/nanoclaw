---
name: github-daily-brief
description: Generate a combined GitHub daily brief across all tracked repos. Shows top PRs ranked by attention score (reviewer requested, failing checks, conflicts, staleness) plus a per-repo digest of PR and issue counts. Requires /add-github-triage with trackedRepos configured.
---

# GitHub Daily Brief

Generate a combined summary across all tracked repos: top PRs needing attention ranked
by score, plus a per-repo digest of open PRs and issues.

## Pre-flight

Confirm `src/github/brief.ts` exists. If not, tell the user to run `/add-github-triage` first.

## Usage

Common invocation forms:
- `/github-daily-brief` — use all repos in `trackedRepos` (falls back to `defaultRepo`)
- `/github-daily-brief owner/repo1 owner/repo2` — override with specific repos

## Run

```bash
# use trackedRepos from config
npm run github:brief

# explicit repos
npm run github:brief -- owner/repo1 owner/repo2
```

The script picks up `username` from `~/.config/nanoclaw/github.json` automatically for
reviewer-request scoring.

## Output

Present the output directly. It is already formatted for chat:

```
📊 *GitHub Daily Brief* — 2 repos

🔥 *Top PRs needing attention*
  owner/repo1 #42 Fix auth bug [🔄] (1d)
  owner/repo2 #7 Update deps [🔍] (3d)

*Per-repo digest*
  *owner/repo1*: 3 PRs 👀2 | 5 issues 🚨1 ⚠️2
  *owner/repo2*: 1 PR | no issues
```

**Attention score factors (highest first):**
- 🔥 Reviewer explicitly requested (+100)
- Failing CI checks (+60)
- Merge conflict (+40)
- Changes requested (+30)
- Review required (+20)
- Stale >14d (+10)

## Scheduling

To run this automatically each morning, add a scheduled task in the agent:

```
Every day at 9am, run: npm run github:brief
```

## Error handling

- `gh CLI not found` → tell the user to run `/add-github-triage`
- `gh auth check failed` → verify `GITHUB_TOKEN` or run `gh auth login`
- `no repos configured` → add `trackedRepos` to `~/.config/nanoclaw/github.json`
- Any other error → show the raw error message
