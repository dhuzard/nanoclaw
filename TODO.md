# NanoClaw — Personal Roadmap

Personal fork of [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw).
Track work-in-progress, planned features, and future integrations.

---

## 🔄 In progress

### /add-gchat — Google Chat channel (v1 DM-only)

Code is merged and building. GCP setup paused.
GCP project: `static-operator-491509-c2`
No gcloud — all steps via browser Console.

```
[x] src/channels/google-chat.ts written
[x] src/channels/index.ts updated
[x] npm run build passes
[ ] Phase 2 — Enable APIs
      chat.googleapis.com
      pubsub.googleapis.com
[ ] Phase 3 — Service account nanoclaw-gchat created
      JSON key → ~/.config/nanoclaw/gchat-credentials.json
[ ] Phase 4 — Pub/Sub topic nanoclaw-gchat + pull subscription nanoclaw-gchat-sub
      IAM: nanoclaw-gchat SA → roles/pubsub.subscriber on subscription
[ ] Phase 5 — Chat App configured: Connection settings → Cloud Pub/Sub
      Topic: projects/static-operator-491509-c2/topics/nanoclaw-gchat
[ ] Phase 6 — GCHAT_SUBSCRIPTION in .env, build, restart
[ ] Phase 7 — Bot added to DM, space registered as NanoClaw group
[ ] Phase 8 — Smoke test: inbound DM received + reply sent
```

Resume with: "resume /add-gchat"

---

## 📋 Planned

### Voice transcription for Google Chat

**Skill:** extend existing `/add-voice-transcription` (currently WhatsApp-only)
or create a new `extend-voice-gchat` skill.

- [ ] Detect audio attachment events in `google-chat.ts` (Chat API `attachment` field)
- [ ] Download audio blob via Chat API `media.download`
- [ ] Pass to Whisper transcription pipeline (reuse `src/transcription.ts` once
      `/add-voice-transcription` is applied)
- [ ] Deliver as `[Voice: <transcript>]` content to the agent — same format as WhatsApp

**Dependency:** `/add-voice-transcription` must be applied first.
**Note:** v1 Google Chat channel is text-only; attachment handling is deferred.

---

### Image / picture-to-text for Google Chat

**Skill:** extend existing `/add-image-vision` (currently WhatsApp-only)
or create `extend-image-gchat`.

- [ ] Detect image attachment events in `google-chat.ts`
- [ ] Download image via Chat API `media.download`
- [ ] Resize with `sharp` (reuse `src/image.ts` once `/add-image-vision` is applied)
- [ ] Deliver as base64 multimodal content block to the container agent

**Dependency:** `/add-image-vision` must be applied first.
**Note:** Deferred until v1 DM text flow is validated end-to-end.

---

### Metadatapp MCP integration

Push and sync structured data between NanoClaw agents and Metadatapp via an
MCP server. Agents recognize specific IDs in messages and call Metadatapp MCP
tools to fetch, update, or sync records.

**Skill:** `/add-metadatapp` (stub created at `.claude/skills/add-metadatapp/`)

- [ ] Confirm Metadatapp MCP server endpoint and auth method
- [ ] Add MCP server config to agent runner (follow `/add-ollama-tool` pattern)
- [ ] Define ID recognition patterns (e.g. `#META-123`, `APP-456`, custom regex)
- [ ] Implement ID extraction in the container skill or agent CLAUDE.md prompt
- [ ] Test: agent receives message with ID → calls Metadatapp MCP → fetches record
- [ ] Test: agent pushes data to Metadatapp → record synced

**Design notes:**
- ID recognition can be done in the agent's system prompt (no code change) or
  as a container skill that post-processes messages before routing.
- The MCP server is added to the agent runner config and scoped to groups that
  need it (not all groups).
- Credentials go in `.env` and are injected via OneCLI — never in containers directly.

---

## 🗂 Skill inventory

| Skill | Status | Notes |
|-------|--------|-------|
| `/add-gchat` | 🔄 in progress | GCP setup paused |
| `/add-voice-transcription` | ✅ applied | WhatsApp + Whisper API |
| `/use-local-whisper` | ⬜ not applied | Apple Silicon local transcription |
| `/add-image-vision` | ✅ applied | WhatsApp image → multimodal via sharp |
| `/add-metadatapp` | 📝 stub created | Metadatapp MCP push/sync |
| `/add-github-triage` | ✅ applied (v2) | Multi-repo, PR scoring, daily brief |
| `/add-gmail` | ✅ applied | Gmail channel + tools |
| `/add-whatsapp` | ✅ applied | Primary channel |

---

## 💡 Ideas / future

- **Google Chat threads** — v2: support ROOM / GROUP_CHAT spaces, thread context
- **Proactive GChat messages** — scheduled briefs pushed to a GChat DM
- **Metadatapp webhooks** — Metadatapp pushes events to NanoClaw (reverse sync)
- **Cross-channel ID tracking** — same Metadatapp record referenced across
  WhatsApp, GChat, and email threads
