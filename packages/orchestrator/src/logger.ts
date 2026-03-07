import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import { LogLevel, Logger } from '@parallax/common'
import { Server as SocketServer } from 'socket.io'
import { dbService } from './database.js'

let currentLogLevels: LogLevel[] = ['info', 'success', 'warn', 'error']
const taskStatuses = new Map<
  string,
  { msg: string; startTime: number; status: 'queued' | 'running' | 'done' | 'failed' | 'canceled' }
>()
const taskLogs = new Map<
  string,
  Array<{ message: string; icon: string; level: 'info' | 'warning' | 'error'; timestamp: number }>
>()

let io: SocketServer | undefined

export const setIo = (socketServer: SocketServer) => {
  io = socketServer
}

export const setLogLevels = (levels: LogLevel[]) => {
  currentLogLevels = levels
}

export const getTaskStatuses = () => {
  return taskStatuses
}
export const getTaskLogs = () => {
  return taskLogs
}

export const setTaskQueued = (taskId: string, msg: string) => {
  taskStatuses.set(taskId, {
    msg: stripAnsi(msg),
    startTime: taskStatuses.get(taskId)?.startTime || Date.now(),
    status: 'queued',
  })
  if (io) {
    io.emit('task_status', { taskId, status: 'queued' })
  }
}

export const setTaskRunning = (taskId: string, msg: string) => {
  taskStatuses.set(taskId, {
    msg: stripAnsi(msg),
    startTime: taskStatuses.get(taskId)?.startTime || Date.now(),
    status: 'running',
  })
  if (io) {
    io.emit('task_status', { taskId, status: 'running' })
  }
}

export const setTaskDone = (taskId: string, msg: string) => {
  taskStatuses.set(taskId, {
    msg: stripAnsi(msg),
    startTime: taskStatuses.get(taskId)?.startTime || Date.now(),
    status: 'done',
  })
  if (io) {
    io.emit('task_status', { taskId, status: 'done' })
  }
}

export const setTaskFailed = (taskId: string, msg: string) => {
  taskStatuses.set(taskId, {
    msg: stripAnsi(msg),
    startTime: taskStatuses.get(taskId)?.startTime || Date.now(),
    status: 'failed',
  })
  if (io) {
    io.emit('task_status', { taskId, status: 'failed' })
  }
}

export const setTaskCanceled = (taskId: string, msg: string) => {
  taskStatuses.set(taskId, {
    msg: stripAnsi(msg),
    startTime: taskStatuses.get(taskId)?.startTime || Date.now(),
    status: 'canceled',
  })
  if (io) {
    io.emit('task_status', { taskId, status: 'canceled' })
  }
}

export const clearTaskState = (taskId: string) => {
  taskStatuses.delete(taskId)
  taskLogs.delete(taskId)
  if (io) {
    io.emit('task_removed', { taskId })
  }
}

export const printHeader = () => {
  console.log(`\n${chalk.cyan('parallax_')}`)
  console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)))
}

const pushLog = (
  taskId: string | undefined,
  icon: string,
  msg: string,
  level: 'info' | 'warning' | 'error'
) => {
  const rawMsg = stripAnsi(msg)
    .trim()
    .replace(/[\uFFFD]/g, '')
  if (!rawMsg) {
    return
  }

  const lines = rawMsg.split('\n')
  for (const line of lines) {
    const cleanLine = line.trim()
    if (!cleanLine) {
      continue
    }

    const taskIdPrefix = taskId ? chalk.magenta(`[${taskId}]`) : ''
    const formattedLine = `${taskIdPrefix} ${icon} ${cleanLine}`
    const storedLine = `${taskId ? `[${taskId}] ` : ''}${stripAnsi(icon)} ${cleanLine}`

    // Print directly to terminal so it scrolls and is never lost
    console.log(formattedLine)

    if (taskId) {
      const logs = taskLogs.get(taskId) || []
      const timestamp = Date.now()
      const entry = { message: storedLine, icon: stripAnsi(icon), level, timestamp }
      logs.push(entry)
      if (logs.length > 1000) {
        logs.shift()
      }
      taskLogs.set(taskId, logs)
      dbService.appendTaskLog({
        taskExternalId: taskId,
        ...entry,
      })
      if (io) {
        io.emit('log', { taskId, msg: cleanLine, icon: stripAnsi(icon), level, timestamp })
      }
    }
  }
}

export const logger: Logger = {
  info: (msg: string, taskId?: string) => {
    if (taskId) {
      const current = taskStatuses.get(taskId)
      taskStatuses.set(taskId, {
        msg: stripAnsi(msg),
        startTime: current?.startTime || Date.now(),
        status: current?.status || 'running',
      })
    }
    if (currentLogLevels.includes('info')) {
      pushLog(taskId, chalk.blue('ℹ'), msg, 'info')
    }
  },
  success: (msg: string, taskId?: string) => {
    if (taskId) {
      const current = taskStatuses.get(taskId)
      taskStatuses.set(taskId, {
        msg: stripAnsi(msg),
        startTime: current?.startTime || Date.now(),
        status: current?.status || 'running',
      })
    }
    if (currentLogLevels.includes('success')) {
      pushLog(taskId, chalk.green('✔'), msg, 'info')
    }
  },
  warn: (msg: string, taskId?: string) => {
    if (taskId) {
      const current = taskStatuses.get(taskId)
      taskStatuses.set(taskId, {
        msg: stripAnsi(msg),
        startTime: current?.startTime || Date.now(),
        status: current?.status || 'running',
      })
    }
    if (currentLogLevels.includes('warn')) {
      pushLog(taskId, chalk.yellow('⚠'), msg, 'warning')
    }
  },
  error: (msg: string, taskId?: string) => {
    if (taskId) {
      const current = taskStatuses.get(taskId)
      taskStatuses.set(taskId, {
        msg: stripAnsi(msg),
        startTime: current?.startTime || Date.now(),
        status: current?.status || 'running',
      })
    }
    if (currentLogLevels.includes('error')) {
      pushLog(taskId, chalk.red('✖'), msg, 'error')
    }
  },
}
