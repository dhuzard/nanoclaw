/**
 * Google Chat channel for NanoClaw — v1: DM-only, asynchronous.
 *
 * Receive path: Google Chat app publishes events to a Cloud Pub/Sub topic;
 * this channel pulls from a pull subscription on a timer.  No public URL
 * is required — identical pattern to Slack's Socket Mode.
 *
 * Send path: Chat REST API (spaces.messages.create).  The Chat app must be
 * an explicit member of the target DM space; otherwise the API returns 403.
 *
 * Auth:
 *   - Service account JSON key at ~/.config/nanoclaw/gchat-credentials.json.
 *   - Chat API calls use the `chat.bot` OAuth scope on that key.
 *   - Pub/Sub pull uses the `pubsub` OAuth scope on the same key.
 *   - The service account must also hold roles/pubsub.subscriber on the
 *     subscription (IAM grant, separate from the OAuth scope).
 *
 * Required env var:
 *   GCHAT_SUBSCRIPTION=projects/{project}/subscriptions/{sub}
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { google, chat_v1, pubsub_v1 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

import { logger } from '../logger.js';
import { ChannelOpts, registerChannel } from './registry.js';
import { Channel } from '../types.js';

const CREDS_PATH = path.join(
  os.homedir(),
  '.config',
  'nanoclaw',
  'gchat-credentials.json',
);

/** Maximum bytes per outgoing message (Google Chat API limit). */
const SEND_BYTE_LIMIT = 32_000;
/** Messages to pull per poll cycle. */
const PULL_MAX = 20;
/** Base poll interval in ms. */
const POLL_INTERVAL_MS = 5_000;
/** Maximum backoff cap in ms. */
const BACKOFF_CAP_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Minimal types for the Chat event payload published over Pub/Sub.
// We keep this local rather than pulling from googleapis to stay insulated
// from upstream schema changes.
// ---------------------------------------------------------------------------

interface ChatEventSender {
  name?: string; // "users/12345"
  displayName?: string;
  type?: string; // "HUMAN" | "BOT"
}

interface ChatEventSpace {
  name?: string; // "spaces/AAAA"
  type?: string; // "DM" | "ROOM" | "GROUP_CHAT"
}

interface ChatEventMessage {
  name?: string; // "spaces/AAAA/messages/BBBB" — stable unique ID
  text?: string;
  fallbackText?: string;
  createTime?: string;
  sender?: ChatEventSender;
  space?: ChatEventSpace;
}

interface ChatEvent {
  type: 'MESSAGE' | 'ADDED_TO_SPACE' | 'REMOVED_FROM_SPACE' | 'CARD_CLICKED';
  eventTime?: string;
  message?: ChatEventMessage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split text into chunks each fitting within maxBytes when UTF-8 encoded.
 * Steps back from the byte boundary to avoid splitting multi-byte sequences.
 */
function splitByBytes(text: string, maxBytes: number): string[] {
  const buf = Buffer.from(text, 'utf-8');
  if (buf.length <= maxBytes) return [text];

  const chunks: string[] = [];
  let offset = 0;
  while (offset < buf.length) {
    let end = Math.min(offset + maxBytes, buf.length);
    // Retreat to the nearest UTF-8 lead byte (not a continuation byte 10xxxxxx)
    while (end < buf.length && (buf[end]! & 0xc0) === 0x80) end--;
    chunks.push(buf.subarray(offset, end).toString('utf-8'));
    offset = end;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Channel implementation
// ---------------------------------------------------------------------------

export class GoogleChatChannel implements Channel {
  name = 'google-chat';

  private auth: GoogleAuth | null = null;
  private chat: chat_v1.Chat | null = null;
  private pubsub: pubsub_v1.Pubsub | null = null;
  private subscription: string;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private seenIds = new Set<string>();
  private consecutiveErrors = 0;
  private opts: ChannelOpts;

  constructor(opts: ChannelOpts, subscription: string) {
    this.opts = opts;
    this.subscription = subscription;
  }

  async connect(): Promise<void> {
    this.auth = new GoogleAuth({
      keyFile: CREDS_PATH,
      scopes: [
        'https://www.googleapis.com/auth/chat.bot',
        'https://www.googleapis.com/auth/pubsub',
      ],
    });

    // Fail fast if the key file is malformed or the SA cannot obtain a token.
    await this.auth.getAccessToken();

    this.chat = google.chat({ version: 'v1', auth: this.auth });
    this.pubsub = google.pubsub({ version: 'v1', auth: this.auth });

    logger.info(
      { subscription: this.subscription },
      'Google Chat channel connected',
    );

    await this.poll();
    this.schedulePoll();
  }

  private schedulePoll(): void {
    if (!this.chat) return;

    const delay =
      this.consecutiveErrors > 0
        ? Math.min(
            POLL_INTERVAL_MS * Math.pow(2, this.consecutiveErrors),
            BACKOFF_CAP_MS,
          )
        : POLL_INTERVAL_MS;

    this.pollTimer = setTimeout(async () => {
      try {
        await this.poll();
        this.consecutiveErrors = 0;
      } catch (err) {
        this.consecutiveErrors++;
        logger.error(
          { err, consecutiveErrors: this.consecutiveErrors },
          'Google Chat poll error',
        );
      }
      this.schedulePoll();
    }, delay);
  }

  private async poll(): Promise<void> {
    if (!this.pubsub) return;

    const res = await this.pubsub.projects.subscriptions.pull({
      subscription: this.subscription,
      requestBody: { maxMessages: PULL_MAX },
    });

    const received = res.data.receivedMessages ?? [];
    if (received.length === 0) return;

    const ackIds: string[] = [];

    for (const item of received) {
      if (!item.ackId || !item.message?.data) continue;

      let accepted = false;
      try {
        const raw = Buffer.from(item.message.data, 'base64').toString('utf-8');
        const event = JSON.parse(raw) as ChatEvent;
        await this.processEvent(event);
        accepted = true;
      } catch (err) {
        // Intentionally not acking — message remains in the subscription
        // and will be redelivered after the ack deadline expires.
        logger.warn({ err }, 'Google Chat: failed to process event; will retry');
      }

      if (accepted) ackIds.push(item.ackId);
    }

    if (ackIds.length > 0) {
      await this.pubsub.projects.subscriptions.acknowledge({
        subscription: this.subscription,
        requestBody: { ackIds },
      });
    }
  }

  /**
   * Process a single Chat event.
   *
   * Returns normally (without throwing) for events we deliberately ignore
   * (non-MESSAGE type, non-DM spaces, BOT sender, duplicates).  Returning
   * normally causes the caller to ack the message so it is not redelivered.
   *
   * Throws only on unexpected processing errors, leaving those messages
   * unacked for retry.
   */
  private async processEvent(event: ChatEvent): Promise<void> {
    // v1: only handle MESSAGE events; ack everything else to clear the backlog.
    if (event.type !== 'MESSAGE') return;

    const msg = event.message;
    if (!msg) return;

    // v1: DM-only.  Skip ROOM / GROUP_CHAT events.
    if (msg.space?.type !== 'DM') {
      logger.debug(
        { spaceType: msg.space?.type },
        'Google Chat: ignoring non-DM event (v1 DM-only)',
      );
      return;
    }

    // Skip messages sent by the bot itself.
    if (msg.sender?.type === 'BOT') return;

    // Deduplicate by the stable Chat message resource name.
    const msgName = msg.name;
    if (!msgName || this.seenIds.has(msgName)) return;
    this.seenIds.add(msgName);

    if (this.seenIds.size > 5000) {
      const ids = [...this.seenIds];
      this.seenIds = new Set(ids.slice(ids.length - 2500));
    }

    const spaceName = msg.space?.name;
    if (!spaceName) return;

    const content = msg.text ?? msg.fallbackText ?? '';
    if (!content) return;

    const chatJid = `gc:${spaceName}`;
    const sender = msg.sender?.name ?? 'unknown';
    const senderName = msg.sender?.displayName ?? sender;
    const timestamp = msg.createTime ?? new Date().toISOString();

    this.opts.onChatMetadata(chatJid, timestamp, spaceName, 'google-chat', false);

    this.opts.onMessage(chatJid, {
      id: msgName,
      chat_jid: chatJid,
      sender,
      sender_name: senderName,
      content,
      timestamp,
      is_from_me: false,
    });

    logger.info({ chatJid, senderName, msgName }, 'Google Chat DM received');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.chat) throw new Error('Google Chat channel not connected');

    // Strip the gc: prefix to get the Chat API space resource name.
    // The app must be a member of this space; if not, the API returns 403.
    const spaceName = jid.replace(/^gc:/, '');
    const chunks = splitByBytes(text, SEND_BYTE_LIMIT);

    for (const chunk of chunks) {
      await this.chat.spaces.messages.create({
        parent: spaceName,
        requestBody: { text: chunk },
      });
    }

    logger.debug({ jid, chunks: chunks.length }, 'Google Chat message sent');
  }

  isConnected(): boolean {
    return this.chat !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('gc:');
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.chat = null;
    this.pubsub = null;
    this.auth = null;
    logger.info('Google Chat channel disconnected');
  }
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------

registerChannel('google-chat', (opts: ChannelOpts) => {
  const subscription = process.env.GCHAT_SUBSCRIPTION;
  if (!subscription) return null;

  if (!fs.existsSync(CREDS_PATH)) {
    logger.warn(
      `Google Chat: credentials not found at ${CREDS_PATH}. Run /add-gchat to set up.`,
    );
    return null;
  }

  return new GoogleChatChannel(opts, subscription);
});
