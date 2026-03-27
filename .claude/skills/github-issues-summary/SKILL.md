---
name: github-issues-summary
description: Fetch and summarize open GitHub issues for a repo. Groups by blockers / urgent / normal. Uses the default repo from ~/.config/nanoclaw/github.json or an explicit owner/repo argument.
---

# GitHub Issues Summary

Fetch open issues for a GitHub repo and produce a concise chat-friendly summary.

## Pre-flight

Confirm `src/github/issues.ts` exists. If not, tell the user to run `/add-github-triage` first.

## Usage

Parse the user's message for an explicit `owner/repo` argument. Common forms:
- `/github-issues-summary` — use default repo
- `/github-issues-summary owner/repo` — use the given repo
- `/github-issues-summary for owner/repo` — same

## Run

With the resolved repo (or no argument to fall back to the configured default):

```bash
# default repo
npx tsx src/github/issues.ts

# explicit repo
npx tsx src/github/issues.ts owner/repo
```

## Output

Present the command output directly to the user. It is already formatted for chat:

```
*owner/repo* — 12 open issues

🚨 *Blockers (1)*
  #42 Database migrations fail on prod deploy (2d)

⚠️ *Urgent (3)*
  #38 Login redirect broken on mobile Safari (5d)
  ...

📋 *Normal (8)*
  #35 Add dark mode (14d)
  ...
```

## Error handling

If the command fails:
- `gh CLI not found` → tell the user to run `/add-github-triage`
- `gh auth check failed` → tell the user to verify `GITHUB_TOKEN` or run `gh auth login`
- `Could not resolve to a Repository` → check the owner/repo spelling
- Any other error → show the raw error message so the user can diagnose
