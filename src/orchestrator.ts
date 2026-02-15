/**
 * Orchestrator - The Brain
 *
 * Receives a task → Plans → Delegates → Synthesizes
 *
 * This is the core of Minions. It:
 * 1. Creates an execution plan (DAG of agent tasks)
 * 2. Persists everything to the PostgreSQL blackboard
 * 3. Executes agents phase by phase
 * 4. Feeds each agent ONLY its needed context
 * 5. Collects and synthesizes results
 */

import { Blackboard } from './blackboard.js';
import { generateEnhancedPlan } from './enhanced-planner.js';
import { buildAgentPrompt, executeAgent } from './agent.js';
import type { ExecutionPlan, Phase, PlannedTask, AgentTask, Run } from './types.js';

export class Orchestrator {
  private bb: Blackboard;

  constructor() {
    this.bb = new Blackboard();
  }

  /**
   * Execute a task end-to-end
   */
  async run(task: string): Promise<{ runId: string; result: unknown }> {
    const startTime = Date.now();

    // 1. Create run record
    const runId = await this.bb.createRun(task);
    this.log('info', `Run ${runId} started: "${task}"`);

    try {
      // 2. Plan execution
      await this.bb.updateRun(runId, { status: 'planning' });
      const tools = await this.bb.getTools();
      // Use enhanced planner for Iteration 3
      const plan = await generateEnhancedPlan(task, tools);

      await this.bb.updateRun(runId, {
        status: 'running',
        plan: plan as any,
      });

      this.log('info', `Plan: ${plan.strategy}`);
      this.printPlan(plan);

      // 3. Create task records for all phases
      const taskIdMap = new Map<string, string>(); // role -> task UUID

      for (const phase of plan.phases) {
        for (const planned of phase.tasks) {
          // Resolve dependency UUIDs
          const depIds = planned.dependencies
            .map(dep => taskIdMap.get(dep))
            .filter((id): id is string => !!id);

          const taskId = await this.bb.createTask({
            run_id: runId,
            role: planned.role,
            description: planned.description,
            inputs: planned.inputs,
            dependencies: depIds,
          });

          taskIdMap.set(planned.role, taskId);
        }
      }

      // 4. Execute phases
      for (const phase of plan.phases) {
        this.log('info', `\n${'='.repeat(60)}`);
        this.log('info', `${phase.name}: ${phase.description}`);
        this.log('info', `${'='.repeat(60)}`);

        if (phase.parallel) {
          // Execute all tasks in parallel
          await Promise.all(
            phase.tasks.map(planned =>
              this.executeTask(runId, planned, taskIdMap, tools.filter(t =>
                planned.tools.includes(t.name)
              ))
            )
          );
        } else {
          // Execute sequentially
          for (const planned of phase.tasks) {
            await this.executeTask(runId, planned, taskIdMap, tools.filter(t =>
              planned.tools.includes(t.name)
            ));
          }
        }
      }

      // 5. Collect final results
      const allTasks = await this.bb.getTasksByRun(runId);
      const allEntries = await this.bb.queryEntries(runId);

      const result = {
        tasks: allTasks.map(t => ({
          role: t.role,
          status: t.status,
          confidence: t.confidence,
          execution_time_ms: t.execution_time_ms,
          result: t.result,
        })),
        entries: allEntries.map(e => ({
          key: e.key,
          written_by: e.written_by,
          tags: e.tags,
          value: e.value,
        })),
        summary: this.synthesize(allTasks, allEntries),
      };

      const executionTime = Date.now() - startTime;

      await this.bb.updateRun(runId, {
        status: 'completed',
        result: result as any,
        completed_at: new Date(),
        execution_time_ms: executionTime,
      });

      this.log('info', `\n${'='.repeat(60)}`);
      this.log('info', `Run completed in ${(executionTime / 1000).toFixed(1)}s`);
      this.log('info', `Tasks: ${allTasks.filter(t => t.status === 'completed').length}/${allTasks.length} succeeded`);
      this.log('info', `Entries: ${allEntries.length} written to blackboard`);
      this.log('info', `${'='.repeat(60)}`);

      return { runId, result };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      await this.bb.updateRun(runId, {
        status: 'failed',
        error: error.message,
        completed_at: new Date(),
        execution_time_ms: executionTime,
      });

      this.log('error', `Run failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a single agent task
   */
  private async executeTask(
    runId: string,
    planned: PlannedTask,
    taskIdMap: Map<string, string>,
    tools: any[],
  ): Promise<void> {
    const taskId = taskIdMap.get(planned.role);
    if (!taskId) {
      this.log('error', `No task ID found for role: ${planned.role}`);
      return;
    }

    this.log('info', `\n→ Agent [${planned.role}] starting...`);

    await this.bb.updateTask(taskId, {
      status: 'running',
      started_at: new Date(),
    });

    const startTime = Date.now();

    try {
      // Get relevant context from blackboard (ONLY what this agent needs)
      const context = planned.context_tags.length > 0
        ? await this.bb.queryEntries(runId, { tags: planned.context_tags, limit: 20 })
        : [];

      // Build focused prompt
      const prompt = buildAgentPrompt(
        planned.role,
        planned.description,
        context,
        tools,
      );

      this.log('info', `  Context: ${context.length} entries, ${tools.length} tools`);
      this.log('info', `  Prompt: ${prompt.length} chars`);

      // Execute agent
      const result = await executeAgent(prompt);

      const executionTime = Date.now() - startTime;

      // Write entries to blackboard
      if (result.entries) {
        for (const entry of result.entries) {
          await this.bb.writeEntry({
            run_id: runId,
            key: `${planned.role}:${entry.key}`,
            value: entry.value,
            written_by: planned.role,
            tags: entry.tags,
            entity_ids: entry.entity_ids,
            event_date: entry.event_date,
          });
        }
      }

      // Save artifacts
      if (result.artifacts) {
        for (const artifact of result.artifacts) {
          await this.bb.saveArtifact({
            run_id: runId,
            task_id: taskId,
            name: artifact.name,
            content_type: artifact.content_type,
            content: artifact.content,
          });
        }
      }

      await this.bb.updateTask(taskId, {
        status: result.success ? 'completed' : 'failed',
        result: result.data as any,
        confidence: result.confidence,
        completed_at: new Date(),
        execution_time_ms: executionTime,
        error: result.error || null,
      });

      this.log(
        result.success ? 'info' : 'warn',
        `  ✓ Agent [${planned.role}] ${result.success ? 'completed' : 'failed'} in ${(executionTime / 1000).toFixed(1)}s (confidence: ${result.confidence})`
      );
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      await this.bb.updateTask(taskId, {
        status: 'failed',
        error: error.message,
        completed_at: new Date(),
        execution_time_ms: executionTime,
      });

      this.log('error', `  ✗ Agent [${planned.role}] threw: ${error.message}`);
    }
  }

  /**
   * Synthesize results from all tasks
   */
  private synthesize(tasks: AgentTask[], entries: any[]): string {
    const succeeded = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');

    let summary = `## Results\n\n`;
    summary += `**${succeeded.length}/${tasks.length}** agents completed successfully.\n\n`;

    for (const task of succeeded) {
      summary += `### ${task.role}\n`;
      if (typeof task.result === 'string') {
        summary += task.result + '\n\n';
      } else if (task.result) {
        summary += '```json\n' + JSON.stringify(task.result, null, 2) + '\n```\n\n';
      }
    }

    if (failed.length > 0) {
      summary += `### Failures\n`;
      for (const task of failed) {
        summary += `- **${task.role}**: ${task.error}\n`;
      }
    }

    return summary;
  }

  /**
   * Print the execution plan
   */
  private printPlan(plan: ExecutionPlan): void {
    console.log('\n┌─ Execution Plan ─────────────────────────────────────');
    for (let i = 0; i < plan.phases.length; i++) {
      const phase = plan.phases[i];
      const isLast = i === plan.phases.length - 1;
      console.log(`│`);
      console.log(`├─ ${phase.name} ${phase.parallel ? '(parallel)' : '(sequential)'}`);
      for (let j = 0; j < phase.tasks.length; j++) {
        const task = phase.tasks[j];
        const prefix = isLast && j === phase.tasks.length - 1 ? '└' : '├';
        console.log(`│  ${prefix}─ [${task.role}] ${task.tools.length > 0 ? `tools: ${task.tools.join(', ')}` : ''}`);
      }
    }
    console.log(`└──────────────────────────────────────────────────────\n`);
  }

  private log(level: string, message: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    const prefix = level === 'error' ? '✗' : level === 'warn' ? '!' : '•';
    console.log(`[${ts}] ${prefix} ${message}`);
  }

  async close(): Promise<void> {
    await this.bb.close();
  }
}
