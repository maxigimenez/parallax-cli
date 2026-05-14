import { App } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import type { SlackBotOptions, SlackNotificationPayload } from './types.js'
import { sendNotification } from './notifications.js'
import { registerPlanApprovalHandlers } from './handlers/plan-approval.js'
import { registerSlashCommands } from './handlers/commands.js'

export class SlackBot {
  private app: App
  private client: WebClient
  private channel: string
  private apiBaseUrl: string
  private threadRegistry = new Map<string, string>()

  constructor({ config, apiBaseUrl }: SlackBotOptions) {
    this.channel = config.channel
    this.apiBaseUrl = apiBaseUrl
    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      socketMode: true,
    })
    this.client = new WebClient(config.botToken)

    registerPlanApprovalHandlers(this.app, apiBaseUrl)
    registerSlashCommands(this.app, apiBaseUrl)
  }

  async start(): Promise<void> {
    await this.app.start()
  }

  async stop(): Promise<void> {
    await this.app.stop()
  }

  async notify(payload: SlackNotificationPayload): Promise<void> {
    await sendNotification(this.client, this.channel, payload, this.threadRegistry)
  }
}
