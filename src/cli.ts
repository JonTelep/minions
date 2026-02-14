#!/usr/bin/env node
/**
 * Minions CLI
 *
 * Usage:
 *   minions run "task description"
 *   minions tools                    - List available tools
 *   minions tools add <json-file>    - Register a new tool
 *   minions history                  - Show recent runs
 *   minions show <run-id>            - Show run details
 */

import { Orchestrator } from './orchestrator.js';
import { Blackboard } from './blackboard.js';

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'run': {
      const task = args.join(' ');
      if (!task) {
        console.error('Usage: minions run "task description"');
        process.exit(1);
      }

      console.log('🤖 Minions - Universal Agent Orchestration');
      console.log(`Task: ${task}\n`);

      const orchestrator = new Orchestrator();
      try {
        const { runId, result } = await orchestrator.run(task);
        console.log(`\nRun ID: ${runId}`);
        console.log('\n' + (result as any).summary);
      } finally {
        await orchestrator.close();
      }
      break;
    }

    case 'tools': {
      const bb = new Blackboard();
      try {
        if (args[0] === 'add' && args[1]) {
          const fs = await import('fs');
          const tool = JSON.parse(fs.readFileSync(args[1], 'utf-8'));
          const id = await bb.registerTool(tool);
          console.log(`Tool registered: ${tool.name} (${id})`);
        } else {
          const tools = await bb.getTools();
          console.log('Available Tools:\n');
          for (const tool of tools) {
            console.log(`  ${tool.name} (${tool.category})`);
            console.log(`    ${tool.description}\n`);
          }
        }
      } finally {
        await bb.close();
      }
      break;
    }

    case 'history': {
      const bb = new Blackboard();
      try {
        const res = await (bb as any).pool.query(
          `SELECT id, task, status, execution_time_ms, started_at
           FROM minions.runs ORDER BY started_at DESC LIMIT 10`
        );
        console.log('Recent Runs:\n');
        for (const run of res.rows) {
          const time = run.execution_time_ms
            ? `${(run.execution_time_ms / 1000).toFixed(1)}s`
            : 'in progress';
          console.log(`  ${run.id.slice(0, 8)} | ${run.status.padEnd(10)} | ${time.padEnd(8)} | ${run.task.slice(0, 60)}`);
        }
      } finally {
        await bb.close();
      }
      break;
    }

    case 'show': {
      const runId = args[0];
      if (!runId) {
        console.error('Usage: minions show <run-id>');
        process.exit(1);
      }

      const bb = new Blackboard();
      try {
        const run = await bb.getRun(runId);
        if (!run) {
          console.error(`Run not found: ${runId}`);
          process.exit(1);
        }

        console.log(`Run: ${run.id}`);
        console.log(`Task: ${run.task}`);
        console.log(`Status: ${run.status}`);
        console.log(`Time: ${run.execution_time_ms ? `${(run.execution_time_ms / 1000).toFixed(1)}s` : 'N/A'}`);

        const tasks = await bb.getTasksByRun(runId);
        console.log(`\nTasks (${tasks.length}):`);
        for (const task of tasks) {
          console.log(`  [${task.status}] ${task.role} (${task.execution_time_ms ? `${(task.execution_time_ms / 1000).toFixed(1)}s` : '-'})`);
        }

        const entries = await bb.queryEntries(runId);
        console.log(`\nBlackboard Entries (${entries.length}):`);
        for (const entry of entries) {
          console.log(`  ${entry.key} by ${entry.written_by} [${entry.tags.join(', ')}]`);
        }

        if (run.result) {
          console.log(`\nResult Summary:`);
          console.log((run.result as any).summary || JSON.stringify(run.result, null, 2));
        }
      } finally {
        await bb.close();
      }
      break;
    }

    default:
      console.log(`🤖 Minions - Universal Agent Orchestration

Usage:
  minions run "task description"    Execute a task with agent orchestration
  minions tools                     List available tools
  minions tools add <file.json>     Register a new tool
  minions history                   Show recent runs
  minions show <run-id>             Show run details

Examples:
  minions run "Research the top 5 Go web frameworks and create a comparison report"
  minions run "Audit the security of our capitol-trades API"
  minions run "Build a Python script that analyzes CSV sales data"
`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
