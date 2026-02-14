/**
 * Blackboard - PostgreSQL-backed shared state store
 *
 * The single source of truth for all agent data within a run.
 * Agents read context and write findings here.
 */

import pg from 'pg';
import type { BlackboardEntry, Tool, AgentTask, Run, Artifact } from './types.js';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

export class Blackboard {
  private pool: pg.Pool;

  constructor() {
    this.pool = new Pool({ connectionString: DATABASE_URL });
  }

  // ============================================================================
  // Run Management
  // ============================================================================

  async createRun(task: string): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO minions.runs (task) VALUES ($1) RETURNING id`,
      [task]
    );
    return res.rows[0].id;
  }

  async updateRun(id: string, updates: Partial<Run>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'plan' || key === 'result' || key === 'metadata') {
        sets.push(`${key} = $${idx}::jsonb`);
        values.push(JSON.stringify(value));
      } else {
        sets.push(`${key} = $${idx}`);
        values.push(value);
      }
      idx++;
    }

    values.push(id);
    await this.pool.query(
      `UPDATE minions.runs SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async getRun(id: string): Promise<Run | null> {
    const res = await this.pool.query(`SELECT * FROM minions.runs WHERE id = $1`, [id]);
    return res.rows[0] || null;
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  async createTask(task: Omit<AgentTask, 'id' | 'status' | 'result' | 'confidence' | 'started_at' | 'completed_at' | 'execution_time_ms' | 'error' | 'retry_count'>): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO minions.tasks (run_id, role, description, inputs, dependencies)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [task.run_id, task.role, task.description, JSON.stringify(task.inputs), task.dependencies]
    );
    return res.rows[0].id;
  }

  async updateTask(id: string, updates: Partial<AgentTask>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'inputs' || key === 'result') {
        sets.push(`${key} = $${idx}::jsonb`);
        values.push(JSON.stringify(value));
      } else if (key === 'dependencies') {
        sets.push(`${key} = $${idx}`);
        values.push(value);
      } else {
        sets.push(`${key} = $${idx}`);
        values.push(value);
      }
      idx++;
    }

    values.push(id);
    await this.pool.query(
      `UPDATE minions.tasks SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async getTasksByRun(runId: string): Promise<AgentTask[]> {
    const res = await this.pool.query(
      `SELECT * FROM minions.tasks WHERE run_id = $1 ORDER BY started_at`,
      [runId]
    );
    return res.rows;
  }

  async getPendingTasks(runId: string): Promise<AgentTask[]> {
    const res = await this.pool.query(
      `SELECT * FROM minions.tasks WHERE run_id = $1 AND status = 'pending'`,
      [runId]
    );
    return res.rows;
  }

  async getReadyTasks(runId: string): Promise<AgentTask[]> {
    // Tasks whose dependencies are all completed
    const res = await this.pool.query(
      `SELECT t.* FROM minions.tasks t
       WHERE t.run_id = $1 AND t.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM unnest(t.dependencies) dep_id
         WHERE dep_id NOT IN (
           SELECT id::text FROM minions.tasks
           WHERE run_id = $1 AND status = 'completed'
         )
       )`,
      [runId]
    );
    return res.rows;
  }

  // ============================================================================
  // Entry Management (Blackboard core)
  // ============================================================================

  async writeEntry(entry: {
    run_id: string;
    key: string;
    value: unknown;
    written_by: string;
    tags?: string[];
    entity_ids?: string[];
    event_date?: string;
  }): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO minions.entries (run_id, key, value, written_by, tags, entity_ids, event_date)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
       ON CONFLICT (run_id, key) DO UPDATE SET
         value = EXCLUDED.value,
         written_by = EXCLUDED.written_by,
         tags = EXCLUDED.tags,
         entity_ids = EXCLUDED.entity_ids,
         event_date = EXCLUDED.event_date,
         version = minions.entries.version + 1,
         created_at = NOW()
       RETURNING id`,
      [
        entry.run_id,
        entry.key,
        JSON.stringify(entry.value),
        entry.written_by,
        entry.tags || [],
        entry.entity_ids || [],
        entry.event_date || null,
      ]
    );
    return res.rows[0].id;
  }

  async queryEntries(runId: string, opts?: {
    tags?: string[];
    written_by?: string;
    entity_ids?: string[];
    limit?: number;
  }): Promise<BlackboardEntry[]> {
    let query = `SELECT * FROM minions.entries WHERE run_id = $1`;
    const params: unknown[] = [runId];
    let idx = 2;

    if (opts?.tags && opts.tags.length > 0) {
      query += ` AND tags && $${idx}`;
      params.push(opts.tags);
      idx++;
    }

    if (opts?.written_by) {
      query += ` AND written_by = $${idx}`;
      params.push(opts.written_by);
      idx++;
    }

    if (opts?.entity_ids && opts.entity_ids.length > 0) {
      query += ` AND entity_ids && $${idx}`;
      params.push(opts.entity_ids);
      idx++;
    }

    query += ` ORDER BY created_at`;

    if (opts?.limit) {
      query += ` LIMIT $${idx}`;
      params.push(opts.limit);
    }

    const res = await this.pool.query(query, params);
    return res.rows;
  }

  // ============================================================================
  // Artifacts
  // ============================================================================

  async saveArtifact(artifact: {
    run_id: string;
    task_id?: string;
    name: string;
    content_type: string;
    content?: string;
    file_path?: string;
  }): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO minions.artifacts (run_id, task_id, name, content_type, content, file_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [artifact.run_id, artifact.task_id || null, artifact.name, artifact.content_type, artifact.content || null, artifact.file_path || null]
    );
    return res.rows[0].id;
  }

  // ============================================================================
  // Tools
  // ============================================================================

  async getTools(category?: string): Promise<Tool[]> {
    let query = `SELECT * FROM minions.tools WHERE enabled = true`;
    const params: unknown[] = [];

    if (category) {
      query += ` AND category = $1`;
      params.push(category);
    }

    query += ` ORDER BY name`;
    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async getToolsByNames(names: string[]): Promise<Tool[]> {
    const res = await this.pool.query(
      `SELECT * FROM minions.tools WHERE name = ANY($1) AND enabled = true`,
      [names]
    );
    return res.rows;
  }

  async registerTool(tool: Omit<Tool, 'id' | 'enabled'>): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO minions.tools (name, description, category, usage, install_command, examples)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         usage = EXCLUDED.usage,
         install_command = EXCLUDED.install_command,
         examples = EXCLUDED.examples
       RETURNING id`,
      [tool.name, tool.description, tool.category, tool.usage, tool.install_command || null, JSON.stringify(tool.examples || [])]
    );
    return res.rows[0].id;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async close(): Promise<void> {
    await this.pool.end();
  }
}
