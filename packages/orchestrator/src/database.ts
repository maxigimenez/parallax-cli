import Database from 'better-sqlite3'
import { Task, TaskPlanState, TaskStatus } from '@parallax/common'
import path from 'path'

const defaultDbPath = path.resolve(process.cwd(), 'parallax.db')
const dbPath = process.env.PARALLAX_DB_PATH
  ? path.resolve(process.env.PARALLAX_DB_PATH)
  : process.env.PARALLAX_DATA_DIR
    ? path.resolve(process.env.PARALLAX_DATA_DIR, 'parallax.db')
    : defaultDbPath

const db = new Database(dbPath === 'memory' ? ':memory:' : dbPath)

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    externalId TEXT UNIQUE,
    title TEXT,
    description TEXT,
    status TEXT,
    projectId TEXT,
    branchName TEXT,
    prUrl TEXT,
    prNumber INTEGER,
    lastReviewEventAt TEXT,
    reviewState TEXT,
    createdAt INTEGER,
    updatedAt INTEGER,
    planState TEXT,
    planMarkdown TEXT,
    planPrompt TEXT,
    planResult TEXT,
    approvedBy TEXT,
    approvedAt INTEGER,
    executionAttempts INTEGER DEFAULT 0,
    lastAgent TEXT
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskExternalId TEXT NOT NULL,
    message TEXT NOT NULL,
    icon TEXT NOT NULL,
    level TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`)

db.exec(
  'CREATE INDEX IF NOT EXISTS idx_task_logs_task_external_id_timestamp ON task_logs(taskExternalId, timestamp, id)'
)

const existingColumns = new Set(
  (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map(
    (column) => column.name
  )
)

const ensureColumn = (name: string, definition: string) => {
  if (existingColumns.has(name)) {
    return
  }

  db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`)
  existingColumns.add(name)
}

ensureColumn('prNumber', 'INTEGER')
ensureColumn('lastReviewEventAt', 'TEXT')
ensureColumn('reviewState', 'TEXT')
ensureColumn('planState', 'TEXT')
ensureColumn('planMarkdown', 'TEXT')
ensureColumn('planPrompt', 'TEXT')
ensureColumn('planResult', 'TEXT')
ensureColumn('approvedBy', 'TEXT')
ensureColumn('approvedAt', 'INTEGER')
ensureColumn('executionAttempts', 'INTEGER DEFAULT 0')
ensureColumn('lastAgent', 'TEXT')

export const dbService = {
  saveTask(task: Task) {
    const upsert = db.prepare(`
      INSERT INTO tasks (id, externalId, title, description, status, projectId, branchName, prUrl, prNumber, lastReviewEventAt, reviewState, planState, planMarkdown, planPrompt, planResult, approvedBy, approvedAt, executionAttempts, lastAgent, createdAt, updatedAt)
      VALUES (@id, @externalId, @title, @description, @status, @projectId, @branchName, @prUrl, @prNumber, @lastReviewEventAt, @reviewState, @planState, @planMarkdown, @planPrompt, @planResult, @approvedBy, @approvedAt, @executionAttempts, @lastAgent, @createdAt, @updatedAt)
      ON CONFLICT(externalId) DO UPDATE SET
        title=excluded.title,
        description=excluded.description,
        status=excluded.status,
        planState=COALESCE(excluded.planState, planState),
        planMarkdown=COALESCE(excluded.planMarkdown, planMarkdown),
        planPrompt=COALESCE(excluded.planPrompt, planPrompt),
        planResult=COALESCE(excluded.planResult, planResult),
        approvedBy=COALESCE(excluded.approvedBy, approvedBy),
        approvedAt=COALESCE(excluded.approvedAt, approvedAt),
        executionAttempts=COALESCE(excluded.executionAttempts, executionAttempts),
        lastAgent=COALESCE(excluded.lastAgent, lastAgent),
        updatedAt=excluded.updatedAt
    `)

    upsert.run({
      branchName: null,
      prUrl: null,
      prNumber: null,
      lastReviewEventAt: null,
      reviewState: 'NONE',
      planState: TaskPlanState.PLAN_GENERATING,
      planMarkdown: null,
      planPrompt: null,
      planResult: null,
      approvedBy: null,
      approvedAt: null,
      executionAttempts: 0,
      lastAgent: task.lastAgent || null,
      ...task,
    })
  },

  getTaskByExternalId(externalId: string): Task | undefined {
    return db.prepare('SELECT * FROM tasks WHERE externalId = ?').get(externalId) as
      | Task
      | undefined
  },

  getTaskById(id: string): Task | undefined {
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  },

  getTaskByLookup(lookup: string): Task | undefined {
    return (
      (db.prepare('SELECT * FROM tasks WHERE id = ?').get(lookup) as Task | undefined) ||
      (db.prepare('SELECT * FROM tasks WHERE externalId = ?').get(lookup) as Task | undefined)
    )
  },

  getTaskByPrNumber(projectId: string, prNumber: number): Task | undefined {
    return db
      .prepare('SELECT * FROM tasks WHERE projectId = ? AND prNumber = ?')
      .get(projectId, prNumber) as Task | undefined
  },

  listTasks(): Task[] {
    return db.prepare('SELECT * FROM tasks ORDER BY updatedAt DESC').all() as Task[]
  },

  getLogsByTaskExternalId(taskExternalId: string) {
    return db
      .prepare(
        'SELECT message, icon, level, timestamp FROM task_logs WHERE taskExternalId = ? ORDER BY timestamp ASC, id ASC LIMIT 1000'
      )
      .all(taskExternalId) as Array<{
      message: string
      icon: string
      level: 'info' | 'warning' | 'error'
      timestamp: number
    }>
  },

  getPendingTasks(): Task[] {
    return db.prepare("SELECT * FROM tasks WHERE status = 'PENDING'").all() as Task[]
  },

  updateTaskStatus(id: string, status: TaskStatus) {
    db.prepare('UPDATE tasks SET status = ?, updatedAt = ? WHERE id = ?').run(
      status,
      Date.now(),
      id
    )
  },

  updateTaskPlanState(id: string, planState: TaskPlanState) {
    db.prepare('UPDATE tasks SET planState = ?, updatedAt = ? WHERE id = ?').run(
      planState,
      Date.now(),
      id
    )
  },

  updateTaskPlanOutput(
    id: string,
    details: {
      planState?: TaskPlanState
      planMarkdown?: string | null
      planPrompt?: string | null
      planResult?: string | null
      lastAgent?: string | null
    }
  ) {
    db.prepare(
      `
        UPDATE tasks
        SET
          planState = COALESCE(?, planState),
          planMarkdown = COALESCE(?, planMarkdown),
          planPrompt = COALESCE(?, planPrompt),
          planResult = COALESCE(?, planResult),
          lastAgent = COALESCE(?, lastAgent),
          updatedAt = ?
        WHERE id = ?
      `
    ).run(
      details.planState || null,
      details.planMarkdown || null,
      details.planPrompt || null,
      details.planResult || null,
      details.lastAgent || null,
      Date.now(),
      id
    )
  },

  approveTaskPlan(id: string, approvedBy?: string) {
    db.prepare(
      'UPDATE tasks SET planState = ?, approvedBy = ?, approvedAt = ?, updatedAt = ? WHERE id = ?'
    ).run(TaskPlanState.PLAN_APPROVED, approvedBy || null, Date.now(), Date.now(), id)
  },

  rejectTaskPlan(id: string) {
    db.prepare('UPDATE tasks SET planState = ?, updatedAt = ? WHERE id = ?').run(
      TaskPlanState.PLAN_REJECTED,
      Date.now(),
      id
    )
  },

  incrementExecutionAttempts(id: string) {
    db.prepare(
      `
      UPDATE tasks
      SET executionAttempts = COALESCE(executionAttempts, 0) + 1,
          updatedAt = ?
      WHERE id = ?
    `
    ).run(Date.now(), id)
  },

  updateTaskPullRequestInfo(
    id: string,
    details: { branchName: string; prUrl: string; prNumber: number }
  ) {
    db.prepare(
      'UPDATE tasks SET branchName = ?, prUrl = ?, prNumber = ?, reviewState = ?, updatedAt = ? WHERE id = ?'
    ).run(details.branchName, details.prUrl, details.prNumber, 'WAITING_FOR_REVIEW', Date.now(), id)
  },

  updateTaskReviewEventAt(id: string, timestamp: string) {
    db.prepare('UPDATE tasks SET lastReviewEventAt = ?, updatedAt = ? WHERE id = ?').run(
      timestamp,
      Date.now(),
      id
    )
  },

  updateTaskReviewState(id: string, reviewState: Task['reviewState']) {
    db.prepare('UPDATE tasks SET reviewState = ?, updatedAt = ? WHERE id = ?').run(
      reviewState,
      Date.now(),
      id
    )
  },

  appendTaskLog(entry: {
    taskExternalId: string
    message: string
    icon: string
    level: 'info' | 'warning' | 'error'
    timestamp: number
  }) {
    db.prepare(
      'INSERT INTO task_logs (taskExternalId, message, icon, level, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(entry.taskExternalId, entry.message, entry.icon, entry.level, entry.timestamp)

    db.prepare(
      `
        DELETE FROM task_logs
        WHERE taskExternalId = ?
          AND id NOT IN (
            SELECT id FROM task_logs
            WHERE taskExternalId = ?
            ORDER BY timestamp DESC, id DESC
            LIMIT 1000
          )
      `
    ).run(entry.taskExternalId, entry.taskExternalId)
  },

  clearTaskLogs(taskExternalId: string) {
    db.prepare('DELETE FROM task_logs WHERE taskExternalId = ?').run(taskExternalId)
  },

  resetExecutionAttempts(id: string) {
    db.prepare('UPDATE tasks SET executionAttempts = 0, updatedAt = ? WHERE id = ?').run(Date.now(), id)
  },

  clearTaskPullRequestInfo(id: string) {
    db.prepare(
      'UPDATE tasks SET branchName = NULL, prUrl = NULL, prNumber = NULL, lastReviewEventAt = NULL, reviewState = ?, updatedAt = ? WHERE id = ?'
    ).run('NONE', Date.now(), id)
  },

  resetTaskForFullRetry(id: string) {
    db.prepare(
      `
        UPDATE tasks
        SET
          planState = ?,
          planMarkdown = NULL,
          planPrompt = NULL,
          planResult = NULL,
          approvedBy = NULL,
          approvedAt = NULL,
          executionAttempts = 0,
          updatedAt = ?
        WHERE id = ?
      `
    ).run(TaskPlanState.PLAN_GENERATING, Date.now(), id)
  },

  listTaskLogs(options?: { since?: number; taskExternalId?: string; limit?: number }) {
    const since = options?.since ?? 0
    const limit = Math.max(1, Math.min(500, options?.limit ?? 200))
    const taskExternalId = options?.taskExternalId?.trim()

    if (taskExternalId) {
      return db
        .prepare(
          `
            SELECT taskExternalId, message, icon, level, timestamp
            FROM task_logs
            WHERE taskExternalId = ? AND timestamp >= ?
            ORDER BY timestamp ASC, id ASC
            LIMIT ?
          `
        )
        .all(taskExternalId, since, limit) as Array<{
        taskExternalId: string
        message: string
        icon: string
        level: 'info' | 'warning' | 'error'
        timestamp: number
      }>
    }

    return db
      .prepare(
        `
          SELECT taskExternalId, message, icon, level, timestamp
          FROM task_logs
          WHERE timestamp >= ?
          ORDER BY timestamp ASC, id ASC
          LIMIT ?
        `
      )
      .all(since, limit) as Array<{
      taskExternalId: string
      message: string
      icon: string
      level: 'info' | 'warning' | 'error'
      timestamp: number
    }>
  },
}
