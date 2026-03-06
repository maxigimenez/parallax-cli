import { randomBytes } from 'node:crypto'

export function createTaskId(): string {
  return randomBytes(6).toString('hex')
}
