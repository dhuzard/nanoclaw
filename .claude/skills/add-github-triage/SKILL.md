---
name: add-github-triage
description: Set up read-only GitHub triage for NanoClaw (v2). Verifies gh CLI, configures auth, saves default repo, tracked repos, and GitHub username. Enables /github-issues-summary, /github-pr-review-summary, and /github-daily-brief.
---

# Add GitHub Triage

This skill adds read-only GitHub triage to NanoClaw. Once set up you can run
`/github-issues-summary`, `/github-pr-review-summary`, and `/github-daily-brief`.

## Phase 1: Pre-flight

### Check if already applied

If `src/github/client.ts` already exists, skip to Phase 3 (auth check). The code is
already in place.

### Check gh is installed

```bash
gh --version
```

If the command fails, tell the user:

> gh CLI is required. Install it from https://cli.github.com, then re-run `/add-github-triage`.

Stop here if gh is not installed.

## Phase 2: Apply Code Changes

### Merge the skill branch

```bash
git remote -v
```

If a remote named `origin` points to the user's fork, merge from the local branch:

```bash
git fetch origin skill/github-triage 2>/dev/null || true
git merge origin/skill/github-triage 2>/dev/null || true
```

If the branch is already the current branch (i.e. the user is already on
`skill/github-triage`), there is nothing to merge — the code is already present.

This brings in:
- `src/github/client.ts` — thin wrapper that shells out to `gh` and injects `GH_TOKEN`
- `src/github/config.ts` — reads/writes `~/.config/nanoclaw/github.json`
- `src/github/issues.ts` — fetch, categorize, and format open issues (with filters)
- `src/github/pulls.ts` — fetch, score, and format open PRs (with filters)
- `src/github/format.ts` — shared chat-friendly formatters
- `src/github/brief.ts` — multi-repo combined daily brief

### Validate

```bash
npm run build
```

Build must be clean before proceeding. Fix any TypeScript errors if they appear.

## Phase 3: Auth

### Configure GITHUB_TOKEN

Ask the user with `AskUserQuestion`:

> Do you have a `GITHUB_TOKEN` set in your environment or `.env`?
> - **Yes** — I'll use it automatically (gh picks it up as `GH_TOKEN`)
> - **No** — I'll use the existing `gh auth` session (run `gh auth login` if not yet done)

If the user says no token, verify the existing gh session works:

```bash
gh auth status
```

If auth fails, tell the user to run `gh auth login` and come back.

If the user has a token, add it to `.env`:

```bash
grep -q '^GITHUB_TOKEN=' .env 2>/dev/null || echo 'GITHUB_TOKEN=<paste token here>' >> .env
```

Tell the user to replace `<paste token here>` with their actual token (classic token with
`repo` scope, or fine-grained with read access to the target repos).

## Phase 4: Configure Repos and Username

Ask the user with `AskUserQuestion`:

> 1. What is your **default GitHub repo** for triage? (format: `owner/repo`)
> 2. Do you have **additional repos** to track? (comma-separated, or leave blank)
> 3. What is your **GitHub username**? (used to score PRs where you're a requested reviewer)

Save all to `~/.config/nanoclaw/github.json`:

```bash
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.config/nanoclaw/github.json';
const cfg = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf-8')) : {};
cfg.defaultRepo = '<defaultRepo>';
cfg.trackedRepos = '<comma-separated repos>'.split(',').map(s => s.trim()).filter(Boolean);
if (!cfg.trackedRepos.includes(cfg.defaultRepo)) cfg.trackedRepos.unshift(cfg.defaultRepo);
cfg.username = '<github username>';
fs.mkdirSync(require('path').dirname(p), {recursive: true});
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
console.log('Saved:', JSON.stringify(cfg, null, 2));
"
```

If the user has only one repo, `trackedRepos` will be `["owner/repo"]`.
If they skip username, omit the `cfg.username` line.

## Phase 5: Smoke Test

```bash
npm run github:issues
```

Expected: a formatted summary of open issues for the default repo.

```bash
npm run github:pulls
```

Expected: a formatted summary of open PRs.

```bash
npm run github:brief
```

Expected: a combined brief across all tracked repos.

If any command fails, check:
- `gh auth status`
- `GITHUB_TOKEN` value in `.env`
- that the repo names are correct in `~/.config/nanoclaw/github.json`

## Phase 6: Done

Tell the user:

> GitHub triage is ready. Available commands:
>
> - `/github-issues-summary` — open issues grouped by blockers / urgent / normal
> - `/github-pr-review-summary` — open PRs ranked by attention score
> - `/github-daily-brief` — combined brief across all tracked repos
>
> All commands use `<defaultRepo>` by default. Pass `owner/repo` as an argument to
> override for a one-off query. Filters: `--label`, `--assignee`, `--days`.

## Troubleshooting

### `gh CLI failed: ...`

- Run `gh auth status` to verify auth
- Run `gh issue list --repo owner/repo` manually to see the raw error
- If using a token: verify it has `repo` (classic) or `contents:read + metadata:read` (fine-grained) scope

### `Cannot find module` errors

Run `npm run build` to recompile.

### Config file not found

The config is stored in `~/.config/nanoclaw/github.json`. Recreate it manually:

```bash
cat > ~/.config/nanoclaw/github.json << 'EOF'
{
  "defaultRepo": "owner/repo",
  "trackedRepos": ["owner/repo"],
  "username": "your-github-username"
}
EOF
```

## Removal

1. Delete `src/github/` directory
2. Remove `github:issues`, `github:pulls`, `github:brief` scripts from `package.json`
3. Remove `GITHUB_TOKEN` from `.env` if added
4. Remove `~/.config/nanoclaw/github.json` if desired
5. Run `npm run build`
