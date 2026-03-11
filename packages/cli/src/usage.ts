export function printUsage(): void {
  console.log(`Usage:
  parallax --version
  parallax --help
  parallax start [--server-api-port <port>] [--server-ui-port <port>] [--concurrency <count>]
  parallax register <config-file> [--env-file <path>]
  parallax unregister <config-file>
  parallax pending [--approve <id>] [--reject <id>]
  parallax preflight
  parallax pr-review <task-id>
  parallax retry <task-id>
  parallax cancel <task-id>
  parallax stop
  parallax logs [--task <id>]

Commands:
  start      Start orchestrator + UI in background using the provided runtime flags.
  register   Register a repository config in ~/.parallax, with optional project env file.
  unregister Remove a repository config from ~/.parallax.
  pending    List pending plans and optionally approve/reject them.
  preflight  Validate local prerequisites and auth.
  pr-review  [experimental] Apply open human PR review comments to the task's existing open PR.
  retry      Queue a task for manual retry.
  cancel     Cancel a pending or running task.
  stop       Force-stop the running Parallax processes.
  logs       Tail task logs from the running Parallax API.`)
}
