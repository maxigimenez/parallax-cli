export function printUsage(): void {
  console.log(`Usage:
  parallax --version
  parallax --help
  parallax init
  parallax start [--server-api-port <port>] [--server-ui-port <port>] [--concurrency <count>]
  parallax stop
  parallax status
  parallax tasks
  parallax open
  parallax preflight
  parallax pr-review <task-id>
  parallax retry <task-id>
  parallax cancel <task-id>
  parallax logs [--task <id>]

Commands:
  init       Set up Parallax for the first time (interactive wizard).
  start      Start orchestrator + UI in background.
  stop       Force-stop the running Parallax processes.
  status     Show orchestrator state and configured projects.
  tasks      List the last 20 tasks with their status, AI adapter, and model.
  open       Open the dashboard in your browser.
  preflight  Validate local prerequisites and auth.
  pr-review  [experimental] Apply open human PR review comments to the task's existing open PR.
  retry      Queue a task for manual retry.
  cancel     Cancel a pending or running task.
  logs       Tail new task logs from the running Parallax API.`)
}
