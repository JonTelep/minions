/**
 * Minions Core Types
 *
 * Universal agent orchestration — domain agnostic.
 */

// ============================================================================
// Run & Task Types
// ============================================================================

export interface Run {
  id: string;
  task: string;
  plan: ExecutionPlan | null;
  status: RunStatus;
  result: unknown;
  started_at: Date;
  completed_at: Date | null;
  execution_time_ms: number | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

export type RunStatus = 'pending' | 'planning' | 'running' | 'completed' | 'failed';

export interface AgentTask {
  id: string;
  run_id: string;
  role: string;
  description: string;
  inputs: Record<string, unknown>;
  dependencies: string[];
  status: TaskStatus;
  result: unknown;
  confidence: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  execution_time_ms: number | null;
  error: string | null;
  retry_count: number;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

// ============================================================================
// Execution Plan (DAG)
// ============================================================================

export interface ExecutionPlan {
  phases: Phase[];
  estimated_agents: number;
  strategy: string;
}

export interface Phase {
  name: string;
  description: string;
  tasks: PlannedTask[];
  parallel: boolean;
}

export interface PlannedTask {
  role: string;
  description: string;
  inputs: Record<string, unknown>;
  dependencies: string[];  // role names of dependencies
  tools: string[];          // tool names this agent needs
  context_tags: string[];   // blackboard tags to query for context
}

// ============================================================================
// Blackboard Types
// ============================================================================

export interface BlackboardEntry {
  id: string;
  run_id: string;
  key: string;
  value: unknown;
  written_by: string;
  tags: string[];
  entity_ids: string[];
  event_date: string | null;
  created_at: Date;
  version: number;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  usage: string;
  install_command: string | null;
  examples: unknown[];
  enabled: boolean;
}

// ============================================================================
// Artifact Types
// ============================================================================

export interface Artifact {
  id: string;
  run_id: string;
  task_id: string | null;
  name: string;
  content_type: string;
  content: string | null;
  file_path: string | null;
  created_at: Date;
}

// ============================================================================
// Agent Communication
// ============================================================================

export interface AgentPrompt {
  role: string;
  task_description: string;
  context: string;           // Relevant blackboard entries, summarized
  tools: string;             // Tool usage instructions
  output_format: string;     // Expected JSON schema
}

export interface AgentResult {
  success: boolean;
  data: unknown;
  entries: BlackboardWrite[];  // Entries to write to blackboard
  artifacts: ArtifactWrite[];  // Files/outputs to save
  confidence: number;
  error?: string;
}

export interface BlackboardWrite {
  key: string;
  value: unknown;
  tags: string[];
  entity_ids?: string[];
  event_date?: string;
}

export interface ArtifactWrite {
  name: string;
  content_type: string;
  content: string;
}
