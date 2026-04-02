/**
 * Stdio MCP Server for Google Tasks
 *
 * Reads OAuth2 credentials from:
 *   1. GOOGLE_TASKS_CREDS_PATH env var
 *   2. ~/.config/nanoclaw/tasks-credentials.json  (nanoclaw config dir, already mounted)
 *   3. ~/.gmail-mcp/credentials.json              (fallback: reuse Gmail OAuth if tasks scope present)
 *
 * Credential file format (JSON):
 *   { "client_id": "...", "client_secret": "...", "access_token": "...", "refresh_token": "...", "expiry_date": 1234567890000 }
 *
 * Setup: enable tasks.googleapis.com in GCP Console, generate OAuth credentials with
 * scope https://www.googleapis.com/auth/tasks, run the OAuth flow once, save the token
 * to ~/.config/nanoclaw/tasks-credentials.json on the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface Credentials {
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

function credentialsPath(): string {
  if (process.env.GOOGLE_TASKS_CREDS_PATH) {
    return process.env.GOOGLE_TASKS_CREDS_PATH;
  }
  const nanoclaw = path.join(os.homedir(), '.config', 'nanoclaw', 'tasks-credentials.json');
  if (fs.existsSync(nanoclaw)) return nanoclaw;
  return path.join(os.homedir(), '.gmail-mcp', 'credentials.json');
}

function loadCredentials(): Credentials {
  const p = credentialsPath();
  if (!fs.existsSync(p)) {
    throw new Error(
      `Google Tasks credentials not found. Expected at ${p}.\n` +
      `Run the OAuth flow and save credentials to ~/.config/nanoclaw/tasks-credentials.json.\n` +
      `Scopes required: https://www.googleapis.com/auth/tasks`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  // Support both top-level and nested { installed: {...} } key file formats
  const creds = raw.installed || raw.web || raw;
  if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
    throw new Error(
      `Credentials at ${p} are missing required fields (client_id, client_secret, refresh_token).`,
    );
  }
  return creds as Credentials;
}

async function getAccessToken(): Promise<string> {
  const creds = loadCredentials();

  // Return cached token if still valid (60-second buffer)
  if (creds.access_token && creds.expiry_date && Date.now() < creds.expiry_date - 60_000) {
    return creds.access_token;
  }

  // Refresh
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const token = (await res.json()) as { access_token: string; expires_in: number };

  // Persist refreshed token (nanoclaw config dir is read-only inside the container;
  // if write fails we just continue — token will refresh again next run)
  try {
    const p = credentialsPath();
    const updated: Credentials = {
      ...creds,
      access_token: token.access_token,
      expiry_date: Date.now() + token.expires_in * 1000,
    };
    fs.writeFileSync(p, JSON.stringify(updated, null, 2));
  } catch {
    // read-only mount or permission error — not fatal
  }

  return token.access_token;
}

async function tasksApi(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${TASKS_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Tasks API ${method} ${endpoint} → ${res.status}: ${text}`);
  }

  if (res.status === 204) return null; // DELETE returns no body
  return res.json();
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: 'tasks', version: '1.0.0' });

server.tool(
  'list_task_lists',
  'List all Google Task lists. Returns id and title for each list. Call this first to get task list IDs.',
  {},
  async () => {
    const data = (await tasksApi('GET', '/users/@me/lists')) as {
      items?: Array<{ id: string; title: string }>;
    };
    const lists = (data.items ?? []).map((l) => ({ id: l.id, title: l.title }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(lists, null, 2) }] };
  },
);

server.tool(
  'list_tasks',
  'List tasks in a task list. Returns title, id, status, due date, and notes for each task.',
  {
    taskListId: z.string().describe('Task list ID from list_task_lists'),
    showCompleted: z.boolean().default(false).describe('Include completed tasks (default: false)'),
    dueMax: z
      .string()
      .optional()
      .describe('Only tasks due at or before this datetime (RFC 3339, e.g. "2026-04-10T23:59:59Z")'),
  },
  async (args) => {
    const params = new URLSearchParams({
      showCompleted: args.showCompleted ? 'true' : 'false',
      showHidden: 'false',
      maxResults: '100',
    });
    if (args.dueMax) params.set('dueMax', args.dueMax);

    const data = (await tasksApi('GET', `/lists/${args.taskListId}/tasks?${params}`)) as {
      items?: Array<{
        id: string;
        title: string;
        status: string;
        due?: string;
        notes?: string;
      }>;
    };
    const tasks = (data.items ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      due: t.due,
      notes: t.notes,
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
  },
);

server.tool(
  'create_task',
  'Create a new task in a task list. Returns the created task with its ID.',
  {
    taskListId: z.string().describe('Task list ID from list_task_lists'),
    title: z.string().describe('Task title'),
    notes: z.string().optional().describe('Task description or notes'),
    due: z
      .string()
      .optional()
      .describe('Due date in RFC 3339 format (e.g. "2026-04-10T00:00:00.000Z")'),
  },
  async (args) => {
    const body: Record<string, string> = { title: args.title };
    if (args.notes) body.notes = args.notes;
    if (args.due) body.due = args.due;

    const task = await tasksApi('POST', `/lists/${args.taskListId}/tasks`, body);
    return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
  },
);

server.tool(
  'complete_task',
  'Mark a task as completed.',
  {
    taskListId: z.string().describe('Task list ID from list_task_lists'),
    taskId: z.string().describe('Task ID from list_tasks'),
  },
  async (args) => {
    await tasksApi('PATCH', `/lists/${args.taskListId}/tasks/${args.taskId}`, {
      status: 'completed',
    });
    return { content: [{ type: 'text' as const, text: 'Task marked as completed.' }] };
  },
);

server.tool(
  'delete_task',
  'Permanently delete a task. This cannot be undone.',
  {
    taskListId: z.string().describe('Task list ID from list_task_lists'),
    taskId: z.string().describe('Task ID from list_tasks'),
  },
  async (args) => {
    await tasksApi('DELETE', `/lists/${args.taskListId}/tasks/${args.taskId}`);
    return { content: [{ type: 'text' as const, text: 'Task deleted.' }] };
  },
);

server.tool(
  'update_task',
  'Update a task title, notes, or due date.',
  {
    taskListId: z.string().describe('Task list ID from list_task_lists'),
    taskId: z.string().describe('Task ID from list_tasks'),
    title: z.string().optional().describe('New title'),
    notes: z.string().optional().describe('New notes'),
    due: z.string().optional().describe('New due date (RFC 3339)'),
  },
  async (args) => {
    const body: Record<string, string> = {};
    if (args.title) body.title = args.title;
    if (args.notes) body.notes = args.notes;
    if (args.due) body.due = args.due;

    if (Object.keys(body).length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No fields to update provided.' }],
        isError: true,
      };
    }

    const task = await tasksApi('PATCH', `/lists/${args.taskListId}/tasks/${args.taskId}`, body);
    return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
