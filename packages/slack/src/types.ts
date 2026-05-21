import type { AgentDefinition, SlackConfig, Task } from '@parallax/common'

export type SlackNotificationEvent =
  | 'plan_ready'
  | 'pr_created'
  | 'failed'
  | 'canceled'
  | 'execution_started'

export interface SlackNotificationPayload {
  task: Task
  event: SlackNotificationEvent
  agentDef?: AgentDefinition
  extra?: string
}

export interface SlackBotOptions {
  config: SlackConfig
  apiBaseUrl: string
}
