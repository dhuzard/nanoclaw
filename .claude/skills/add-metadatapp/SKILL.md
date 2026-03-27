---
name: add-metadatapp
description: Add Metadatapp MCP server to NanoClaw agents. Enables agents to recognize structured IDs in messages and push or sync records to Metadatapp. Follows the same MCP server pattern as /add-ollama-tool.
---

# Add Metadatapp MCP Integration

Connects NanoClaw container agents to a Metadatapp MCP server so they can
recognize IDs in messages, fetch records, push updates, and sync data.

**Status: stub — fill in Metadatapp connection details before running.**

---

## What this adds

- An MCP server entry in the agent runner config pointing to the Metadatapp server
- A container skill that teaches the agent when and how to call Metadatapp tools
- ID recognition: agents detect structured IDs (configurable pattern) in messages
  and automatically resolve them via Metadatapp before responding

---

## Phase 1: Pre-flight

Confirm Metadatapp MCP server details:

Use `AskUserQuestion` to collect:

1. **MCP server URL or command** — e.g. `http://localhost:3100/mcp` or
   `npx @metadatapp/mcp-server`
2. **Auth method** — API key, OAuth, or none
3. **ID pattern to recognize** — e.g. `#META-\d+`, `APP-[A-Z0-9]+`, or describe
   the format and I will build the regex
4. **Which groups** should have Metadatapp access — all groups, or specific ones
   (e.g. main only)

---

## Phase 2: Configure credentials

Add the Metadatapp API key (or other credential) to `.env`:

```bash
# Replace with actual key name and value
echo "METADATAPP_API_KEY=<your-key>" >> .env
```

The key is injected into containers by the OneCLI gateway — never passed directly.

---

## Phase 3: Add MCP server to agent runner

Edit `container/agent-runner/src/index.ts` to add the Metadatapp MCP server
to the Claude Code SDK configuration.

Pattern (follows `/add-ollama-tool`):

```typescript
mcpServers: {
  metadatapp: {
    // TODO: replace with actual transport config
    // Option A — HTTP/SSE server:
    url: process.env.METADATAPP_MCP_URL ?? 'http://host.docker.internal:3100/mcp',
    // Option B — stdio server:
    // command: 'node',
    // args: ['/workspace/project/node_modules/.bin/metadatapp-mcp'],
    // env: { METADATAPP_API_KEY: process.env.METADATAPP_API_KEY ?? '' },
  },
},
```

Add `METADATAPP_MCP_URL` to `.env` if using HTTP transport.

After editing, rebuild the container:

```bash
./container/build.sh
```

---

## Phase 4: Install container skill

The container skill at `container/skills/metadatapp/` is synced into agent
sessions automatically on next container start.

Create `container/skills/metadatapp/SKILL.md` with:

```markdown
---
name: metadatapp
description: Push and sync records with Metadatapp. Recognize structured IDs
  (e.g. #META-123) in messages and call mcp__metadatapp__* tools to fetch,
  update, or create records.
---

# Metadatapp

When you see a structured ID matching the pattern TODO_PATTERN in a message,
automatically call the Metadatapp MCP tools to resolve it before responding.

## ID recognition

Pattern: TODO — fill in the regex or examples, e.g.:
- `#META-\d+` → Metadatapp record ID
- `APP-[A-Z]{2}-\d{4}` → application reference

## Available tools (via mcp__metadatapp__*)

TODO — list the MCP tools exposed by the Metadatapp server:
- `mcp__metadatapp__get_record` — fetch a record by ID
- `mcp__metadatapp__update_record` — update fields on a record
- `mcp__metadatapp__create_record` — create a new record
- `mcp__metadatapp__sync` — push local changes and pull remote updates

## When to call Metadatapp

- User message contains a recognized ID → resolve it first, include context
- User asks to update, create, or sync a record → call the appropriate tool
- Do not call Metadatapp for general conversation
```

---

## Phase 5: Restart and test

```bash
systemctl --user restart nanoclaw
```

Send a message containing a recognized ID. The agent should:
1. Detect the ID
2. Call `mcp__metadatapp__get_record` automatically
3. Include the resolved record context in its response

Check logs:

```bash
journalctl --user -u nanoclaw -f | grep -i metadatapp
```

---

## TODO — fill in before running

- [ ] Metadatapp MCP server URL or command
- [ ] Auth method and credential name
- [ ] ID pattern regex
- [ ] Which groups need access
- [ ] List of MCP tools the server exposes
- [ ] Container skill ID recognition examples

---

## Removal

1. Remove MCP server entry from `container/agent-runner/src/index.ts`
2. Delete `container/skills/metadatapp/`
3. Remove `METADATAPP_API_KEY` and `METADATAPP_MCP_URL` from `.env`
4. Run `./container/build.sh` and restart NanoClaw
