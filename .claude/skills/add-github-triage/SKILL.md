---
name: add-github-triage
description: Set up read-only GitHub triage for NanoClaw. Verifies gh CLI, configures auth from GITHUB_TOKEN, saves a default owner/repo, and explains /github-issues-summary and /github-pr-review-summary.
---

# Add GitHub Triage

This skill adds read-only GitHub triage to NanoClaw. Once set up, you can run
`/github-issues-summary` and `/github-pr-review-summary` to get concise chat-friendly
summaries of open issues and PRs.

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
- `src/github/issues.ts` — fetch, categorize, and format open issues
- `src/github/pulls.ts` — fetch, categorize, and format open PRs
- `src/github/format.ts` — shared chat-friendly formatters

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
`repo` scope, or a fine-grained token with read access to the target repos).

Verify auth works with the token (if provided):

```bash
GITHUB_TOKEN=$(grep '^GITHUB_TOKEN=' .env 2>/dev/null | cut -d= -f2-) \
  GH_TOKEN="$GITHUB_TOKEN" gh auth status
```

## Phase 4: Configure Default Repo

Ask the user with `AskUserQuestion`:

> What is your default GitHub repo for triage? (format: `owner/repo`)
> You can override this at runtime by passing a repo to each command.

Save it to `~/.config/nanoclaw/github.json`:

```bash
mkdir -p ~/.config/nanoclaw
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.config/nanoclaw/github.json';
const cfg = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf-8')) : {};
cfg.defaultRepo = '<owner/repo the user provided>';
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
console.log('Saved:', cfg);
"
```

## Phase 5: Smoke Test

```bash
npx tsx src/github/issues.ts
```

Expected: a formatted summary of open issues for the default repo.
If it fails, check:
- gh auth status
- GITHUB_TOKEN value in .env
- that the repo name is correct

```bash
npx tsx src/github/pulls.ts
```

Expected: a formatted summary of open PRs.

## Phase 6: Done

Tell the user:

> GitHub triage is ready. Available commands:
>
> - `/github-issues-summary` — open issues grouped by blockers / urgent / normal
> - `/github-pr-review-summary` — open PRs grouped by review status
>
> Both commands use `<default repo>` by default. Pass `owner/repo` as an argument to
> override for a one-off query.

## Troubleshooting

### `gh CLI failed: ...`

- Run `gh auth status` to verify auth
- Run `gh issue list --repo owner/repo` manually to see the raw error
- If using a token: verify it has `repo` (classic) or `contents:read + metadata:read` (fine-grained) scope

### `Cannot find module` errors

Run `npm run build` to recompile. The skill files need to be compiled to `dist/` before
`node` can run them (tsx handles this automatically).

### Config file not found

The default repo is stored in `~/.config/nanoclaw/github.json`. Run `/add-github-triage`
again to recreate it, or create it manually:

```bash
mkdir -p ~/.config/nanoclaw
echo '{"defaultRepo":"owner/repo"}' > ~/.config/nanoclaw/github.json
```

## Removal

1. Delete `src/github/` directory
2. Remove `GITHUB_TOKEN` from `.env` if added
3. Remove `~/.config/nanoclaw/github.json` if desired
4. Run `npm run build`
