---
name: add-gchat
description: Add Google Chat as a NanoClaw channel. DM-only, async, Pub/Sub-based (no public URL required). Guides through GCP setup, service account creation, Pub/Sub topic/subscription, Chat App configuration, and group registration.
---

# Add Google Chat Channel

Adds Google Chat support to NanoClaw.

**v1 scope — DM-only, asynchronous.**
Direct messages to the bot are received and replied to. Group spaces, rooms,
card interactions, slash-command responses, and proactive workflows are deferred
to future versions.

## How it works

```
Google Chat DM  ──► Chat App publishes event ──► Cloud Pub/Sub topic
                                                          │
NanoClaw polls pull subscription ◄────────────────────────┘
      │
      ▼
opts.onMessage() → DB → container agent → sendMessage() → Chat API
```

No public URL required (same pattern as Slack Socket Mode).

## Checklist

```
[ ] GCP project selected and billed
[ ] Google Chat API enabled (chat.googleapis.com)
[ ] Cloud Pub/Sub API enabled (pubsub.googleapis.com)
[ ] Service account created
[ ] Service account key file saved to ~/.config/nanoclaw/gchat-credentials.json
[ ] Chat App configured to publish to a Pub/Sub topic
[ ] Service account granted roles/pubsub.subscriber on the pull subscription (IAM)
[ ] GCHAT_SUBSCRIPTION added to .env
[ ] src/channels/google-chat.ts present
[ ] src/channels/index.ts imports google-chat.js
[ ] npm run build passes
[ ] NanoClaw restarted
[ ] Bot explicitly added to a DM in Google Chat
[ ] Space registered as NanoClaw group (jid: gc:spaces/AAAA...)
[ ] Inbound DM received and delivered to agent
[ ] Reply sent back successfully
```

Mark each item [x] as you complete it.

---

## Phase 1: Pre-flight

Check if the channel is already in place:

```bash
test -f src/channels/google-chat.ts && echo "CODE PRESENT" || echo "CODE MISSING"
grep -q "google-chat" src/channels/index.ts && echo "INDEX OK" || echo "INDEX MISSING"
```

If both are present, skip to Phase 5 (env var + restart).

---

## Phase 2: GCP project setup

Ask the user with `AskUserQuestion`:

> Which Google Cloud project should the Chat App live in?
> (Create a new one at console.cloud.google.com if needed.)

Once you have the project ID, enable the required APIs:

```bash
gcloud config set project PROJECT_ID
gcloud services enable chat.googleapis.com pubsub.googleapis.com
```

If `gcloud` is not installed, tell the user to run these steps manually in the
Google Cloud Console:
- APIs & Services → Enable APIs → search "Google Chat API" → Enable
- APIs & Services → Enable APIs → search "Cloud Pub/Sub API" → Enable

---

## Phase 3: Service account and key

Create a service account:

```bash
gcloud iam service-accounts create nanoclaw-gchat \
  --display-name "NanoClaw Google Chat bot"
```

Download a JSON key:

```bash
gcloud iam service-accounts keys create \
  ~/.config/nanoclaw/gchat-credentials.json \
  --iam-account nanoclaw-gchat@PROJECT_ID.iam.gserviceaccount.com
```

If `gcloud` is not available, guide the user through the Console:
1. IAM & Admin → Service Accounts → Create
2. Service account name: `nanoclaw-gchat`
3. Manage keys → Add key → JSON → save to `~/.config/nanoclaw/gchat-credentials.json`

Confirm the file exists:

```bash
test -f ~/.config/nanoclaw/gchat-credentials.json && echo "KEY OK"
```

**This file is never committed to git and never mounted into agent containers.**

---

## Phase 4: Pub/Sub topic, subscription, and IAM

### Create topic and pull subscription

```bash
gcloud pubsub topics create nanoclaw-gchat --project PROJECT_ID

gcloud pubsub subscriptions create nanoclaw-gchat-sub \
  --topic nanoclaw-gchat \
  --project PROJECT_ID \
  --ack-deadline 60
```

An ack deadline of 60 seconds gives NanoClaw time to accept the message before
it is redelivered.

### Grant the service account Pub/Sub Subscriber (IAM)

```bash
gcloud pubsub subscriptions add-iam-policy-binding nanoclaw-gchat-sub \
  --member "serviceAccount:nanoclaw-gchat@PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/pubsub.subscriber" \
  --project PROJECT_ID
```

This IAM grant is separate from the OAuth scope in the credentials file.
Both are required: the scope lets the service account request a token for the
Pub/Sub API; the IAM binding controls what that token can do.

---

## Phase 5: Configure the Google Chat App

1. In the Cloud Console, go to **Google Chat API → Configuration**.
2. Fill in the app metadata (name, avatar, description — anything).
3. Under **Connection settings** choose **Cloud Pub/Sub**.
4. Set the Pub/Sub topic to:
   `projects/PROJECT_ID/topics/nanoclaw-gchat`
5. Under **Visibility**, set to your domain or specific users for now.
6. Save.

> **Important:** At this point the Chat App exists but the service account does
> not yet have `chat.bot` scope permissions automatically. Those permissions
> are exercised when the app calls the Chat API with the service account's
> OAuth token. No additional IAM grant is needed for sending — the `chat.bot`
> scope in the credential is sufficient as long as the app is a member of the
> target space.

---

## Phase 6: Add env var and apply code

### Add to .env

```bash
echo "GCHAT_SUBSCRIPTION=projects/PROJECT_ID/subscriptions/nanoclaw-gchat-sub" >> .env
```

### Verify code is in place

The channel code should already be present (installed with this fork).
Confirm:

```bash
test -f src/channels/google-chat.ts && echo "OK"
grep -q "google-chat" src/channels/index.ts && echo "OK"
```

If either is missing, restore from the skill branch or write the files manually
following the instructions in `CONTRIBUTING.md`.

### Build and restart

```bash
npm run build
```

```bash
# Linux (systemd)
systemctl --user restart nanoclaw

# macOS (launchd)
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

---

## Phase 7: Add the bot to a DM and register the space

### Add the bot

In Google Chat, open a new DM and search for your app by name.
Send any message — this creates the DM space and makes the bot a member.

**The bot must be a member of the space before it can send messages there.**
If it is not, `sendMessage` will receive a 403 from the Chat API.

### Find the space resource name

After sending the first DM, check the NanoClaw logs for:

```
Google Chat DM received  chatJid=gc:spaces/AAAA...
```

Or check the Chat API directly:

```bash
CREDS=~/.config/nanoclaw/gchat-credentials.json
ACCESS_TOKEN=$(node -e "
const { GoogleAuth } = require('google-auth-library');
const a = new GoogleAuth({ keyFile: process.env.CREDS, scopes: ['https://www.googleapis.com/auth/chat.bot'] });
a.getAccessToken().then(t => process.stdout.write(t.token || ''));
" CREDS=$CREDS)
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://chat.googleapis.com/v1/spaces?filter=spaceType=DIRECT_MESSAGE" \
  | grep '"name"'
```

### Register the space as a NanoClaw group

In your main NanoClaw chat, ask the agent to register the space:

> Register Google Chat DM `gc:spaces/AAAA...` as a group named "gchat-dm",
> folder "gchat_dm", with no trigger required.

Or register it directly in the database:

```bash
node -e "
const { setRegisteredGroup } = await import('./dist/db.js');
setRegisteredGroup('gc:spaces/AAAA...', {
  name: 'gchat-dm',
  folder: 'gchat_dm',
  trigger: '',
  added_at: new Date().toISOString(),
  requiresTrigger: false,
  isMain: false,
});
console.log('Registered');
"
```

---

## Phase 8: Smoke test

**Test inbound:** Send a DM to the bot in Google Chat. Within a few seconds
you should see the agent respond.

**Test reply:** Check logs for:
```
Google Chat DM received  chatJid=gc:spaces/AAAA...
Google Chat message sent  jid=gc:spaces/AAAA...
```

**If inbound works but replies fail with 403:**
The bot is not a member of the DM space. Add the bot explicitly (Phase 7).

**If nothing is received:**
- Verify the Chat App's Pub/Sub topic matches the subscription's topic.
- Check `gh auth status` on the Pub/Sub subscription:
  ```bash
  gcloud pubsub subscriptions get-iam-policy nanoclaw-gchat-sub
  ```
- Confirm `GCHAT_SUBSCRIPTION` in `.env` matches the full resource name:
  `projects/PROJECT_ID/subscriptions/nanoclaw-gchat-sub`

---

## Auth summary

| What | How |
|------|-----|
| Service account identity | JSON key at `~/.config/nanoclaw/gchat-credentials.json` |
| Chat API (send) | OAuth scope `chat.bot` on the service account token |
| Pub/Sub pull | OAuth scope `pubsub` on the service account token + `roles/pubsub.subscriber` IAM on the subscription |
| Containers | Never see credentials (not mounted, not in `.env` after shadow) |

## Removal

1. Remove `GCHAT_SUBSCRIPTION` from `.env`
2. Delete `src/channels/google-chat.ts`
3. Remove `import './google-chat.js'` from `src/channels/index.ts`
4. Run `npm run build` and restart NanoClaw
5. Optionally delete the GCP resources (topic, subscription, service account)
