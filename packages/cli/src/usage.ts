export function printUsage(): void {
  console.log(`Usage:
  parallax --version
  parallax start [--config <path>] [--env-file <path>]
  parallax pending [--config <path>] [--approve <id|all>] [--reject <id>] [--json]
  parallax preflight
  parallax retry <task-id> [--mode <full|execution>]
  parallax cancel <task-id>
  parallax stop [--force]
  parallax logs [--api <base>] [--task <id>] [--since <epoch-ms>]

Commands:
  start      Start orchestrator + UI in background.
  pending    List pending plans and optionally approve/reject them.
  preflight  Validate local prerequisites and auth.
  retry      Queue a task for manual retry.
  cancel     Cancel a pending or running task.
  stop       Stop running parallax processes.
  logs       Tail task logs from orchestrator API.`)
}
