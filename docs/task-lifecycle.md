# Task Lifecycle

This page explains how Parallax processes tasks end-to-end.

## 1. Pull and queue

Parallax polls configured providers (Linear or GitHub), applies filters, and creates local task records.

Each Parallax task gets a deterministic hash id derived from `projectId + externalId`. That task id is the canonical key used by the API, sockets, CLI actions (`approve`, `reject`, `retry`, `cancel`, `logs`), and UI rendering.

## 2. Plan phase

The selected agent runs in planning mode first.

Plan-related states:

- `PLAN_GENERATING`
- `PLAN_READY`
- `PLAN_REQUIRES_CLARIFICATION`
- `PLAN_APPROVED`
- `PLAN_REJECTED`
- `PLAN_FAILED`
- `NOT_REQUIRED`

Execution does not proceed until the plan is approved (unless plan is marked `NOT_REQUIRED`).

## 3. Approval gates

Plan approval can be done from:

- task dashboard plan section
- CLI via `parallax pending --approve <id>`

Rejection:

- dashboard
- CLI via `parallax pending --reject <id>`

## 4. Execution phase

After approval, Parallax runs implementation and captures:

- logs
- changed files and diffs
- branch/PR metadata when available

Task statuses:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `FAILED`
- `CANCELED`

## 5. Retry and cancellation

Manual retry:

- `parallax retry <task-id>`

Cancellation:

- `parallax cancel <task-id>`

Cancellation only succeeds for cancellable states; otherwise the API returns conflict.

## 6. Observability and history

Parallax stores task state and logs in SQLite under `~/.parallax`. The dashboard subscribes to live updates through sockets and can show historical task information from the same database.
