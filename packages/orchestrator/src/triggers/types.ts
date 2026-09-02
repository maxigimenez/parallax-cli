import type { CommentTarget, ProjectConfig, TriggerEvent } from '@parallax/common'

/**
 * A source of things that might warrant starting an agent.
 *
 * Sources only observe and normalize; they never decide. Deciding is the rule
 * engine's job, and doing is the dispatcher's.
 */
export interface TriggerSource {
  readonly name: string
  collect(project: ProjectConfig): Promise<TriggerEvent[]>
}

/**
 * The tracker writes Parallax performs on its own behalf.
 *
 * Deliberately narrow. Agents do their own git, their own PRs, and their own
 * commits under their own identity; what Parallax still owns is telling the
 * humans what happened -- including when the agent failed and cannot speak for
 * itself -- and moving the ticket's labels along.
 */
export interface TrackerWriter {
  postComment(target: CommentTarget, event: TriggerEvent, body: string): Promise<void>
  updateLabels(event: TriggerEvent, labels: { add?: string[]; remove?: string[] }): Promise<void>
}
