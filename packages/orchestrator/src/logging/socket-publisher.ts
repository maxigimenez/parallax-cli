import { Server as SocketServer } from 'socket.io'
import type { TaskLogEntry } from './task-log-store.js'
import type { TaskRuntimeStatus } from '@parallax/common'

let io: SocketServer | undefined

export function setIo(socketServer: SocketServer) {
  io = socketServer
}

export function emitTaskStatus(taskId: string, status: TaskRuntimeStatus) {
  io?.emit('task_status', { taskId, status })
}

export function emitTaskRemoved(taskId: string) {
  io?.emit('task_removed', { taskId })
}

export function emitTaskLog(taskId: string, entry: TaskLogEntry) {
  io?.emit('log', {
    taskId,
    msg: entry.message,
    icon: entry.icon,
    level: entry.level,
    timestamp: entry.timestamp,
  })
}
