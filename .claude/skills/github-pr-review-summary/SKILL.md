---
name: github-pr-review-summary
description: Fetch and summarize open GitHub pull requests for a repo. Highlights PRs needing attention (approved/changes-requested), in review, drafts, and others. PRs within each bucket are ranked by attention score (reviewer requested, failing checks, conflicts, staleness). Uses the default repo from ~/.config/nanoclaw/github.json or an explicit owner/repo argument.
---

# GitHub PR Review Summary

Fetch open pull requests for a GitHub repo and produce a concise chat-friendly summary
that highlights which PRs need your attention first.

## Pre-flight

Confirm `src/github/pulls.ts` exists. If not, tell the user to run `/add-github-triage` first.

## Usage

Parse the user's message for an optional `owner/repo` argument and filters. Common forms:
- `/github-pr-review-summary` — use default repo
- `/github-pr-review-summary owner/repo` — use the given repo
- `/github-pr-review-summary owner/repo --label hotfix` — filter by label
- `/github-pr-review-summary owner/repo --days 7` — PRs updated in last 7 days

## Run

```bash
# default repo (uses username from config for scoring)
npm run github:pulls

# with repo and optional filters
npm run github:pulls -- owner/repo
npm run github:pulls -- owner/repo --label hotfix
npm run github:pulls -- owner/repo --username alice --days 14
```

## Output

Present the command output directly to the user. It is already formatted for chat:

```
*owner/repo* — 7 open PRs

👀 *Needs attention (2)*
  #91 Fix race condition in queue [✅ merge ready] (1d)
  #88 Refactor auth middleware [🔄 changes requested] (3d)

🔍 *In review (2)*
  #85 Add dark mode by @alice (5d)
  #82 Improve error messages by @bob (7d)

📭 *Open (2)*
  #79 Update deps by @alice (12d)
  #75 Add logging by @carol (18d)

📝 *Drafts (1)*
  #70 WIP: migrate to new API by @dave
```

**Priority order:** Needs attention first (approved = act now, changes requested = reply
needed), then in review, then open, then drafts. Within each bucket PRs are ranked by
attention score: reviewer explicitly requested > failing checks > merge conflicts > stale.

## Error handling

If the command fails:
- `gh CLI not found` → tell the user to run `/add-github-triage`
- `gh auth check failed` → tell the user to verify `GITHUB_TOKEN` or run `gh auth login`
- `Could not resolve to a Repository` → check the owner/repo spelling
- Any other error → show the raw error message so the user can diagnose
