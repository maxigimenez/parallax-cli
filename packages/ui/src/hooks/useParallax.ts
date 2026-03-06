import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import axios from 'axios'
import type { AppConfig } from '@parallax/common'
import { TASK_STATUS, type TaskStatus } from '@/lib/task-constants'

export interface TaskInfo {
  id: string
  title?: string
  description?: string
  projectId?: string
  msg: string
  startTime: number
  status: TaskStatus
  planState?: string
  planMarkdown?: string
  planPrompt?: string
  planResult?: string
  lastAgent?: string
  executionAttempts?: number
  approvedBy?: string
  approvedAt?: number
  logs: Array<{
    message: string
    icon: string
    level: 'info' | 'warning' | 'error' | 'debug'
    timestamp: number
  }>
  branchName?: string
  prUrl?: string
  prNumber?: number
  lastReviewEventAt?: string
  reviewState?: string
}

const API_BASE = 'http://localhost:3000'
const MAX_LOG_ENTRIES = 500

function canonicalizeLogMessage(message: string, icon: string): string {
  const withoutTaskPrefix = message.replace(/^\[[^\]]+\]\s*/, '').trim()
  const escapedIcon = icon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return withoutTaskPrefix.replace(new RegExp(`^${escapedIcon}\\s+`), '').trim()
}

function getLogSignature(log: {
  message: string
  icon: string
  level: 'info' | 'warning' | 'error' | 'debug'
  timestamp: number
}) {
  const normalizedMessage = canonicalizeLogMessage(log.message, log.icon)
  return `${log.timestamp}|${log.icon}|${normalizedMessage}|${log.level}`
}

function mergeTaskLogs(
  existing: Array<{
    message: string
    icon: string
    level: 'info' | 'warning' | 'error' | 'debug'
    timestamp: number
  }>,
  incoming: Array<{
    message: string
    icon: string
    level: 'info' | 'warning' | 'error' | 'debug'
    timestamp: number
  }>
) {
  const signatureToLog = new Map<
    string,
    {
      message: string
      icon: string
      level: 'info' | 'warning' | 'error' | 'debug'
      timestamp: number
    }
  >()

  for (const log of existing) {
    signatureToLog.set(getLogSignature(log), log)
  }

  for (const log of incoming) {
    signatureToLog.set(getLogSignature(log), log)
  }

  const merged = Array.from(signatureToLog.values())
  merged.sort((a, b) => a.timestamp - b.timestamp)

  return merged.slice(-MAX_LOG_ENTRIES)
}

function normalizeStatus(status: string): TaskInfo['status'] {
  if (status === 'IN_PROGRESS' || status === 'running') {
    return TASK_STATUS.RUNNING
  }
  if (status === 'COMPLETED' || status === 'done') {
    return TASK_STATUS.DONE
  }
  if (status === 'FAILED' || status === 'failed') {
    return TASK_STATUS.FAILED
  }
  if (status === 'CANCELED' || status === 'canceled') {
    return TASK_STATUS.CANCELED
  }
  return TASK_STATUS.QUEUED
}

export function useParallax() {
  const [tasks, setTasks] = useState<Record<string, TaskInfo>>({})
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const retryTask = async (taskId: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/retry`)
    setTasks((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {
          id: taskId,
          logs: [],
          startTime: Date.now(),
        }),
        msg: 'Queued for manual retry',
        status: TASK_STATUS.QUEUED,
        logs: [],
      },
    }))
  }

  const cancelTask = async (taskId: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/cancel`)
    setTasks((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {
          id: taskId,
          logs: [],
          startTime: Date.now(),
        }),
        msg: 'Cancellation requested',
        status: TASK_STATUS.CANCELED,
      },
    }))
  }

  const approvePlan = async (taskId: string, approver?: string, planMarkdown?: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/approve`, {
      approver,
      planMarkdown,
    })
    setTasks((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {
          id: taskId,
          logs: [],
          startTime: Date.now(),
          status: TASK_STATUS.QUEUED,
        }),
        msg: 'Plan approved. Queued for execution.',
        status: TASK_STATUS.QUEUED,
      },
    }))
  }

  const rejectPlan = async (taskId: string, reason?: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/reject`, { reason })
    setTasks((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {
          id: taskId,
          logs: [],
          startTime: Date.now(),
          status: TASK_STATUS.FAILED,
        }),
        msg: 'Plan rejected.',
        status: TASK_STATUS.FAILED,
      },
    }))
  }

  useEffect(() => {
    const socket = io(API_BASE)

    // Initial fetch
    const fetchData = async () => {
      try {
        const [tasksRes, configRes] = await Promise.all([
          axios.get(`${API_BASE}/tasks`),
          axios.get(`${API_BASE}/config`)
        ])

        const incoming = tasksRes.data as Array<
          Omit<TaskInfo, 'status'> & {
            status: string
            logs?: TaskInfo['logs']
          }
        >
        setTasks((prev) => {
          const taskMap: Record<string, TaskInfo> = {}

          incoming.forEach((task) => {
            const prevTask = prev[task.id]
            const mergedLogs = mergeTaskLogs(prevTask?.logs || [], task.logs || [])

            taskMap[task.id] = {
              ...task,
              status: normalizeStatus(task.status),
              logs: mergedLogs,
            }
          })

          return taskMap
        })
        setConfig(configRes.data as AppConfig)
      } catch (error) {
        console.error('Failed to fetch initial data', error)
      }
    }

    fetchData()
    const refreshInterval = window.setInterval(() => {
      void fetchData()
    }, 10000)

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))

    socket.on('log', (data) => {
      setTasks((prev) => {
        const incoming = {
          message: data.msg,
          icon: data.icon,
          level: data.level,
          timestamp: data.timestamp,
        }
        const task = prev[data.taskId] || { 
          id: data.taskId, 
          msg: data.msg, 
          startTime: Date.now(), 
          status: TASK_STATUS.RUNNING, 
          logs: [] 
        }

        const existing = task.logs || []
        const latest = existing[existing.length - 1]
        const incomingSignature = getLogSignature(incoming)
        if (latest && incomingSignature === getLogSignature(latest)) {
          return prev
        }

        return {
          ...prev,
          [data.taskId]: {
            ...task,
            msg: data.msg,
            logs: mergeTaskLogs(existing, [incoming]),
          }
        }
      })
    })

    socket.on('task_status', (data) => {
      setTasks((prev) => {
        const newStatus =
          data.status === 'done'
            ? TASK_STATUS.DONE
            : data.status === 'failed'
              ? TASK_STATUS.FAILED
              : data.status === 'canceled'
                ? TASK_STATUS.CANCELED
              : data.status === 'queued'
                ? TASK_STATUS.QUEUED
                : TASK_STATUS.RUNNING
        const current = prev[data.taskId] || {
          id: data.taskId,
          msg: data.status,
          startTime: Date.now(),
          status: TASK_STATUS.QUEUED,
          logs: [],
        }
        return {
          ...prev,
          [data.taskId]: {
            ...current,
            status: newStatus
          }
        }
      })
    })

    socket.on('task_removed', (data) => {
      setTasks((prev) => {
        const next = { ...prev }
        delete next[data.taskId]
        return next
      })
    })

    return () => {
      window.clearInterval(refreshInterval)
      socket.disconnect()
    }
  }, [])

  return {
    tasks,
    config,
    isConnected,
    retryTask,
    cancelTask,
    approvePlan,
    rejectPlan,
  }
}
