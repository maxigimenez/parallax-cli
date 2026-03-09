import { useEffect, useState } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'
import type { AppConfig, TaskPlanState, TaskReviewState } from '@parallax/common'
import { getRequiredApiBase } from '@/lib/runtime-config'
import { TASK_STATUS, type TaskStatus } from '@/lib/task-constants'
import {
  applyTaskLogEvent,
  applyTaskStatusEvent,
  hasTaskState,
  removeTaskState,
  replaceTasksFromApi,
  upsertTaskState,
} from '@/lib/task-store'

export interface TaskInfo {
  id: string
  externalId: string
  title: string
  description: string
  projectId: string
  msg: string
  startTime: number
  status: TaskStatus
  planState?: TaskPlanState
  planMarkdown?: string
  planPrompt?: string
  planResult?: string
  lastAgent?: string
  executionAttempts: number
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
  reviewState: TaskReviewState
}

export function useParallax() {
  const apiBase = getRequiredApiBase()
  const [tasks, setTasks] = useState<Record<string, TaskInfo>>({})
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refreshState = async () => {
    const [tasksRes, configRes] = await Promise.all([
      axios.get(`${apiBase}/tasks`),
      axios.get(`${apiBase}/config`),
    ])

    const incoming = tasksRes.data as Array<
      Omit<TaskInfo, 'status'> & {
        status: string
        logs?: TaskInfo['logs']
      }
    >

    setConfig(configRes.data as AppConfig)
    setTasks((prev) => replaceTasksFromApi(prev, incoming))
    setError(null)
  }

  const retryTask = async (taskId: string) => {
    await axios.post(`${apiBase}/tasks/${encodeURIComponent(taskId)}/retry`)
    await refreshState()
  }

  const cancelTask = async (taskId: string) => {
    await axios.post(`${apiBase}/tasks/${encodeURIComponent(taskId)}/cancel`)
    await refreshState()
  }

  const approvePlan = async (taskId: string, approver?: string, planMarkdown?: string) => {
    await axios.post(`${apiBase}/tasks/${encodeURIComponent(taskId)}/approve`, {
      approver,
      planMarkdown,
    })
    await refreshState()
  }

  const rejectPlan = async (taskId: string) => {
    await axios.post(`${apiBase}/tasks/${encodeURIComponent(taskId)}/reject`)
    await refreshState()
  }

  useEffect(() => {
    let socket: ReturnType<typeof io> | undefined

    const syncIfMissingTask = (taskId: string) => {
      setTasks((prev) => {
        if (hasTaskState(prev, taskId)) {
          return prev
        }

        void refreshState().catch((value) => {
          setError(value instanceof Error ? value : new Error(String(value)))
        })
        return prev
      })
    }

    void refreshState()
      .then(() => {
        socket = io(apiBase)
        socket.on('connect', () => setIsConnected(true))
        socket.on('disconnect', () => setIsConnected(false))
        socket.on('log', (data) => {
          syncIfMissingTask(data.taskId)
          setTasks((prev) => applyTaskLogEvent(prev, data))
        })
        socket.on('task_status', (data) => {
          syncIfMissingTask(data.taskId)
          setTasks((prev) => applyTaskStatusEvent(prev, data))
        })
        socket.on('task_removed', (data) => {
          setTasks((prev) => removeTaskState(prev, data.taskId))
        })
        socket.on('config_updated', () => {
          void refreshState().catch((value) => {
            setError(value instanceof Error ? value : new Error(String(value)))
          })
        })
      })
      .catch((value) => {
        setError(value instanceof Error ? value : new Error(String(value)))
      })

    const refreshInterval = window.setInterval(() => {
      void refreshState().catch((value) => {
        setError(value instanceof Error ? value : new Error(String(value)))
      })
    }, 10000)

    return () => {
      window.clearInterval(refreshInterval)
      socket?.disconnect()
    }
  }, [apiBase])

  return {
    tasks,
    config,
    isConnected,
    error,
    retryTask,
    cancelTask,
    approvePlan,
    rejectPlan,
  }
}
