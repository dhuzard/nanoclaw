---
name: github-triage
description: Fetch GitHub issues, PRs, and daily brief from chat. Commands: /github-brief (combined summary across tracked repos), /github-prs (PR review summary), /github-issues (issues by priority). Main channel only. Read-only.
---

# GitHub Triage

Fetch GitHub issues and PRs directly from chat.

## Pre-flight

This only works in the main channel (requires `/workspace/project` mount):

```bash
test -f /workspace/project/src/github/brief.ts && echo "OK" || echo "NOT_AVAILABLE"
```

If `NOT_AVAILABLE`, reply:
> GitHub triage is only available in the main chat. Try there.

## Commands

### /github-brief

Combined daily brief across all tracked repos (uses `trackedRepos` from config):

```bash
tsx /workspace/project/src/github/brief.ts
```

With explicit repos:

```bash
tsx /workspace/project/src/github/brief.ts owner/repo1 owner/repo2
```

### /github-prs

Open PR summary, ranked by attention score:

```bash
tsx /workspace/project/src/github/pulls.ts
```

With optional filters:

```bash
tsx /workspace/project/src/github/pulls.ts owner/repo
tsx /workspace/project/src/github/pulls.ts owner/repo --label hotfix
tsx /workspace/project/src/github/pulls.ts -- --days 7
```

### /github-issues

Open issues grouped by priority:

```bash
tsx /workspace/project/src/github/issues.ts
```

With optional filters:

```bash
tsx /workspace/project/src/github/issues.ts owner/repo
tsx /workspace/project/src/github/issues.ts owner/repo --label bug --assignee alice
tsx /workspace/project/src/github/issues.ts -- --days 14
```

## Output

Present the command output directly — it is already formatted for chat.

## Error handling

- `gh: command not found` → container image needs a rebuild: `./container/build.sh`
- `gh auth check failed` or `not logged in` → `~/.config/gh/` may be missing on host; run `gh auth login` on the host first
- `no repos configured` → pass a repo explicitly, or set `trackedRepos` in `~/.config/nanoclaw/github.json`
- `Cannot find module` → run `npm run build` in the NanoClaw project on the host
