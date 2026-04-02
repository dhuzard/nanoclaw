# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/db.ts` | SQLite operations (schema, migrations, all queries) |
| `src/config.ts` | Trigger pattern, paths, intervals, env vars |
| `src/types.ts` | Core TypeScript type definitions |
| `src/channels/registry.ts` | Channel factory registry (self-registration at startup) |
| `src/channels/whatsapp.ts` | WhatsApp channel via Baileys (QR/pairing auth, image, voice) |
| `src/channels/gmail.ts` | Gmail channel |
| `src/channels/google-chat.ts` | Google Chat channel (Pub/Sub DM) |
| `src/container-runner.ts` | Spawns agent containers, mounts, injects env, IPC lifecycle |
| `src/container-runtime.ts` | Runtime detection (Docker vs Apple Container) |
| `src/group-queue.ts` | Per-group message queue with global concurrency limit |
| `src/ipc.ts` | Filesystem IPC watcher for outbound agent messages and tasks |
| `src/task-scheduler.ts` | Scheduled tasks with cron/interval/once support |
| `src/router.ts` | Message formatting and outbound channel routing |
| `src/mount-security.ts` | Mount allowlist validation, blocks sensitive paths |
| `src/remote-control.ts` | Claude Code remote-control integration for debugging |
| `src/sender-allowlist.ts` | Per-chat permission control (trigger/drop modes) |
| `src/group-folder.ts` | Group folder path resolution and validation |
| `src/image.ts` | Image resizing with Sharp |
| `src/transcription.ts` | Audio transcription (WhatsApp voice notes via Whisper) |
| `src/github/` | GitHub client, issues, PRs, daily brief, formatting |
| `container/agent-runner/src/index.ts` | Agent runner entry: reads stdin JSON, invokes Claude SDK |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | Stdio MCP server exposing nanoclaw tools to agents |
| `container/skills/` | Skills loaded inside agent containers at runtime |
| `groups/{name}/CLAUDE.md` | Per-group system prompt and memory (isolated) |
| `groups/global/CLAUDE.md` | Shared read-only memory across all groups |

## Architecture

```
Channels (WhatsApp, Telegram, …)
        │  inbound messages
        ▼
    SQLite DB  ◄──────────────────────────────────────┐
        │  message loop (polls every 2s)               │
        ▼                                              │
  Group Queue (per-group, max 5 concurrent)           │
        │                                              │
        ▼                                              │
  Container Runner  ──► Docker/Apple Container        │
        │                  (Claude Agent SDK)          │
        │                  MCP tools: send_message,    │
        │                  schedule_task, …            │
        ▼                                              │
  Filesystem IPC  ────────────────────────────────────┘
  /data/ipc/{group}/messages/*.json
```

### Container Mounts (per group)

| Container path | Host path | Mode |
|----------------|-----------|------|
| `/workspace/group/` | `groups/{folder}/` | read-write |
| `/workspace/global/` | `groups/global/` | read-only (non-main) |
| `/home/node/.claude/` | `data/sessions/{folder}/.claude/` | read-write (session) |
| `/workspace/ipc/` | `data/ipc/{folder}/` | read-write (IPC) |
| `/workspace/project/` | project root | read-only (main only) |
| `/workspace/extra/*` | per `containerConfig` | configurable |

### Database Schema (SQLite)

| Table | Key columns |
|-------|-------------|
| `chats` | jid, name, last_message_time, channel, is_group |
| `messages` | jid, content, timestamp, channel, direction |
| `registered_groups` | jid, name, folder, trigger, container_config, requires_trigger |
| `scheduled_tasks` | group_folder, type (cron/interval/once), next_run, status, script |
| `task_run_logs` | task_id, started_at, duration, status, result, error |
| `sessions` | group_folder, session_id |
| `router_state` | key, value (last_timestamp, last_group_sync, etc.) |

### Group Naming Convention

Groups are stored as `{channel}_{name}` lowercase with hyphens:
- `whatsapp_family-chat`, `telegram_dev-team`, `discord_general`, `slack_engineering`

## Secrets / Credentials / Proxy (OneCLI)

API keys, secret keys, OAuth tokens, and auth credentials are managed by the OneCLI gateway — which handles secret injection into containers at request time, so no keys or tokens are ever passed to containers directly. Run `onecli --help`.

## Skills

Four types of skills exist in NanoClaw. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

### Installed Host Skills (`.claude/skills/`)

Channels: `add-whatsapp`, `add-telegram`, `add-slack`, `add-discord`, `add-gmail`, `add-gchat`, `add-telegram-swarm`

Media/Input: `add-image-vision`, `add-voice-transcription`, `add-pdf-reader`, `add-reactions`, `add-emacs`

Integrations: `add-github-triage`, `add-ollama-tool`, `add-metadatapp`, `add-parallel`, `x-integration`

Operations: `setup`, `debug`, `customize`, `update-nanoclaw`, `claw`, `update-skills`, `add-compact`

Auth/Config: `init-onecli`, `use-native-credential-proxy`, `use-local-whisper`, `convert-to-apple-container`, `channel-formatting`, `add-macos-statusbar`

GitHub: `github-issues-summary`, `github-daily-brief`, `github-pr-review-summary`

Qodo: `qodo-pr-resolver`, `get-qodo-rules`

### Installed Container Skills (`container/skills/`)

`agent-browser`, `capabilities`, `status`, `slack-formatting`, `github-triage`

### Key Operational Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/init-onecli` | Install OneCLI Agent Vault and migrate `.env` credentials to it |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Contributing

Before creating a PR, adding a skill, or preparing any contribution, you MUST read [CONTRIBUTING.md](CONTRIBUTING.md). It covers accepted change types, the four skill types and their guidelines, SKILL.md format rules, PR requirements, and the pre-submission checklist (searching for existing PRs/issues, testing, description format).

**Accepted in core:** Bug fixes, security fixes, simplifications only. Features must be skills.

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
npm run test         # Run vitest unit tests
npm run setup        # Run setup CLI
npm run auth         # WhatsApp authentication
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Testing

Unit tests live alongside source files as `*.test.ts`. Key test file: `src/ipc-auth.test.ts` (IPC authorization security tests). Run with `npm run test`.

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` (or `npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp && npm run build`) to install it. Existing auth credentials and groups are preserved.

**Container Build Cache:** The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

**Mount security:** Mount allowlist is at `~/.config/nanoclaw/mount-allowlist.json` (external, never mounted into containers). Only paths in `allowedRoots` can be used as extra mounts; sensitive patterns (`.ssh`, `.env`, etc.) are always blocked.
