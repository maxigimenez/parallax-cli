import type { SlackConfig, Task } from '@parallax/common'

export type SlackNotificationEvent =
  | 'plan_ready'
  | 'pr_created'
  | 'failed'
  | 'canceled'
  | 'execution_started'

export interface SlackNotificationPayload {
  task: Task
  event: SlackNotificationEvent
  extra?: string
}

export interface SlackBotOptions {
  config: SlackConfig
  apiBaseUrl: string
  onError?: (err: Error) => void
}
