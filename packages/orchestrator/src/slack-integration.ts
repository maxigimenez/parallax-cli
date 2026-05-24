import type { Task } from '@parallax/common'

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
  agentModel?: string
}

export interface SlackBotInterface {
  notify(payload: SlackNotificationPayload): Promise<void>
  stop(): Promise<void>
}

let slackBot: SlackBotInterface | undefined

export function setSlackBot(bot: SlackBotInterface) {
  slackBot = bot
}

export function getSlackBot(): SlackBotInterface | undefined {
  return slackBot
}
