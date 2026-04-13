# mappoclaw

![CI](https://github.com/dhuzard/mappoclaw/actions/workflows/ci.yml/badge.svg)

**mappoclaw** is a secured internal AI assistant for our startup — reachable via WhatsApp and email, with access to our knowledge base, meeting notes, and task management. It handles async questions, surfaces context, and helps automate recurring workflows so we can focus on what matters.

Built on [NanoClaw](https://github.com/qwibitai/nanoclaw) — a lightweight, container-isolated Claude agent framework.

---

## What It Does

- **WhatsApp** — trigger with `@mapp` in our dedicated group or DM
- **Gmail** — monitors our internal inbox, can read and send on our behalf
- **Knowledge base** — reads and writes markdown files in `groups/global/knowledge-base/`
- **Meeting notes** — stores structured notes in `groups/global/meeting-notes/`
- **Google Tasks** — create, complete, and manage tasks across our task lists
- **Scheduled tasks** — recurring jobs (morning briefs, weekly digests, etc.)
- **GitHub** — triage issues and PRs across our tracked repos

## Getting Started

> Prerequisites: Node.js 20+, Docker, [Claude Code](https://claude.ai/code)

```bash
# 1. Fork this repo, then clone your fork
git clone https://github.com/<you>/mappoclaw && cd mappoclaw

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set ASSISTANT_NAME to your trigger word (e.g. @yourbot)

# 4. Add your Anthropic API key via OneCLI
npx claude /init-onecli

# 5. Authenticate WhatsApp
npm run auth

# 6. Register a group and start
npm run setup
npm run dev
```

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for full configuration options.

## Architecture

```
WhatsApp / Gmail
│
▼
SQLite DB ◄─────────────────────────────────┐
│ polling loop (every 2s)               │
▼                                       │
Group Queue (per-group, max 5 concurrent)   │
│                                       │
▼                                       │
Docker Container (Claude Agent SDK)         │
│ MCP tools: send_message,              │
│ schedule_task, tasks, gmail…          │
▼                                       │
Filesystem IPC ─────────────────────────────┘
```

Single Node.js process. Each group runs agents in an isolated Linux container — only explicitly mounted directories are accessible. Credentials never enter containers; API keys are injected at request time via OneCLI Agent Vault.

## Trigger

```
@mapp what did we decide about the pricing model last week?
@mapp add "review Q2 OKRs" to my task list for Friday
@mapp summarize my unread emails from this morning
@mapp schedule a weekly digest every Monday at 8am
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/` | WhatsApp (Baileys), Gmail channel implementations |
| `src/container-runner.ts` | Spawns agent containers with mounts and env |
| `src/task-scheduler.ts` | Cron/interval/once scheduled tasks |
| `src/db.ts` | SQLite: messages, groups, sessions, tasks |
| `container/agent-runner/` | Agent entry point + MCP servers (IPC, Gmail, Tasks) |
| `container/skills/` | Skills loaded inside agent containers at runtime |
| `groups/global/CLAUDE.md` | Shared memory, KB conventions, task patterns |
| `groups/global/knowledge-base/` | Persistent knowledge base (markdown) |
| `groups/global/meeting-notes/` | Meeting notes archive |

## Development

```bash
npm run dev           # Run with hot reload
npm run build         # Compile TypeScript
npm run test          # Run vitest unit tests
./container/build.sh  # Rebuild agent container
```

Restart the service:

```bash
# Linux
systemctl --user restart nanoclaw

# macOS
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Security Model

- Agents run in Docker containers, not behind application-level permission checks
- Only mounted directories are accessible inside containers
- Credentials never enter containers — outbound requests route through OneCLI Agent Vault
- Mount allowlist at `~/.config/nanoclaw/mount-allowlist.json` blocks sensitive paths (`.ssh`, `.env`, etc.)
- Trigger-gated: only `@mapp` messages in registered groups invoke the agent

## Requirements

- Linux or macOS
- Node.js 20+
- Claude Code
- Docker

## Fork This for Your Startup

This repo is designed to be forked. The core framework stays untouched — you only configure what's specific to your team:

| What to change | Where |
|----------------|-------|
| Trigger word (e.g. `@mapp`) | `ASSISTANT_NAME` in `.env` |
| Agent personality, KB conventions | `groups/global/CLAUDE.md` |
| Main group memory and context | `groups/main/CLAUDE.md` |
| Channels (WhatsApp is built in) | Run `/add-telegram`, `/add-slack`, etc. |
| Knowledge base content | `groups/global/knowledge-base/` (gitignored — local only) |

Most customization happens in the `CLAUDE.md` files — they're the agent's long-term memory and instructions, written in plain markdown.

## Based On

This is a personal adaptation of [NanoClaw](https://github.com/qwibitai/nanoclaw) by qwibitai — a minimal, container-isolated Claude agent framework. The core architecture, container isolation model, and skill system come from NanoClaw. This fork adds our startup-specific configuration: `@mapp` trigger, knowledge base pipeline, meeting notes, Google Tasks integration, and startup-focused group memory.

## License

MIT
