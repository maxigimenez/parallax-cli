import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import axios from 'axios'
import type { AppConfig } from '@parallax/common'
import { TASK_STATUS, type TaskStatus } from '@/lib/task-constants'
import {
  applyTaskLogEvent,
  applyTaskStatusEvent,
  removeTaskState,
  replaceTasksFromApi,
  upsertTaskState,
} from '@/lib/task-store'

export interface TaskInfo {
  id: string
  externalId?: string
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

const API_BASE =
  window.__PARALLAX_RUNTIME_CONFIG__?.apiBase ||
  import.meta.env.VITE_PARALLAX_API_BASE ||
  'http://localhost:3000'

export function useParallax() {
  const [tasks, setTasks] = useState<Record<string, TaskInfo>>({})
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const retryTask = async (taskId: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/retry`)
    setTasks((prev) =>
      upsertTaskState(prev, taskId, {
        msg: 'Queued for manual retry',
        status: TASK_STATUS.QUEUED,
        logs: [],
      })
    )
  }

  const cancelTask = async (taskId: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/cancel`)
    setTasks((prev) =>
      upsertTaskState(prev, taskId, {
        msg: 'Cancellation requested',
        status: TASK_STATUS.CANCELED,
      })
    )
  }

  const approvePlan = async (taskId: string, approver?: string, planMarkdown?: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/approve`, {
      approver,
      planMarkdown,
    })
    setTasks((prev) =>
      upsertTaskState(prev, taskId, {
        msg: 'Plan approved. Queued for execution.',
        status: TASK_STATUS.QUEUED,
      })
    )
  }

  const rejectPlan = async (taskId: string, reason?: string) => {
    await axios.post(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/reject`, { reason })
    setTasks((prev) =>
      upsertTaskState(prev, taskId, {
        msg: 'Plan rejected.',
        status: TASK_STATUS.FAILED,
      })
    )
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
        setTasks((prev) => replaceTasksFromApi(prev, incoming))
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
      setTasks((prev) => applyTaskLogEvent(prev, data))
    })

    socket.on('task_status', (data) => {
      setTasks((prev) => applyTaskStatusEvent(prev, data))
    })

    socket.on('task_removed', (data) => {
      setTasks((prev) => removeTaskState(prev, data.taskId))
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
