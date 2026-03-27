---
name: github-pr-review-summary
description: Fetch and summarize open GitHub pull requests for a repo. Highlights PRs needing attention (approved/changes-requested), in review, drafts, and others. Uses the default repo from ~/.config/nanoclaw/github.json or an explicit owner/repo argument.
---

# GitHub PR Review Summary

Fetch open pull requests for a GitHub repo and produce a concise chat-friendly summary
that highlights which PRs need your attention first.

## Pre-flight

Confirm `src/github/pulls.ts` exists. If not, tell the user to run `/add-github-triage` first.

## Usage

Parse the user's message for an explicit `owner/repo` argument. Common forms:
- `/github-pr-review-summary` — use default repo
- `/github-pr-review-summary owner/repo` — use the given repo
- `/github-pr-review-summary for owner/repo` — same

## Run

```bash
# default repo
npx tsx src/github/pulls.ts

# explicit repo
npx tsx src/github/pulls.ts owner/repo
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
needed), then in review, then open, then drafts.

## Error handling

If the command fails:
- `gh CLI not found` → tell the user to run `/add-github-triage`
- `gh auth check failed` → tell the user to verify `GITHUB_TOKEN` or run `gh auth login`
- `Could not resolve to a Repository` → check the owner/repo spelling
- Any other error → show the raw error message so the user can diagnose
