---
name: google-tasks
description: Use Google Tasks to create, list, complete, and delete tasks on behalf of the user.
---

# Google Tasks

You have access to the following MCP tools for Google Tasks. They are available as `mcp__tasks__*`.

## Available tools

| Tool | What it does |
|------|-------------|
| `mcp__tasks__list_task_lists` | List all task lists (returns id + title). Always call this first. |
| `mcp__tasks__list_tasks` | List tasks in a list. Supports `showCompleted` and `dueMax` filters. |
| `mcp__tasks__create_task` | Create a task with title, optional notes, and optional due date. |
| `mcp__tasks__complete_task` | Mark a task as completed. |
| `mcp__tasks__update_task` | Update title, notes, or due date of an existing task. |
| `mcp__tasks__delete_task` | Permanently delete a task. |

## Workflow

1. **Always call `list_task_lists` first** to get the correct `taskListId`. Never guess it.
2. Use the default "My Tasks" list unless the user specifies another.
3. When listing tasks, use `showCompleted: false` by default — only show completed tasks if the user asks.

## Handling natural language

| User says | Action |
|-----------|--------|
| "add X to my tasks" | `create_task` with title X |
| "add X by Friday" | `create_task` with title X, `due` set to Friday midnight UTC |
| "what's on my task list" | `list_tasks` with `showCompleted: false` |
| "what's due today" | `list_tasks` with `dueMax` = end of today UTC |
| "mark X as done" | `list_tasks` to find task ID, then `complete_task` |
| "delete X" | `list_tasks` to find task ID, confirm with user, then `delete_task` |

## Due dates

- Always use RFC 3339 UTC format: `"2026-04-10T00:00:00.000Z"`
- "Today" = midnight tonight UTC, "tomorrow" = next midnight UTC
- If the user says "by Friday" without a time, use end of that day: `T23:59:59.000Z`
- Never assume a due date — only set one if the user explicitly mentions a deadline

## Confirming actions

- For `delete_task`: confirm with the user before deleting unless they said "delete" explicitly
- For `create_task`: no confirmation needed, just do it and confirm in your reply
- For `complete_task`: no confirmation needed

## When tasks MCP is unavailable

If `mcp__tasks__list_task_lists` returns an error about missing credentials, tell the user:

> Google Tasks is not set up yet. Save OAuth credentials to `~/.config/nanoclaw/tasks-credentials.json` on the host machine with scope `https://www.googleapis.com/auth/tasks`, then restart NanoClaw.
