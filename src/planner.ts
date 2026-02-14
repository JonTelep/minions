/**
 * Planner - Decomposes tasks into execution DAGs
 *
 * The orchestrator's brain. Takes a natural language task and
 * produces a phased execution plan with agent assignments.
 *
 * Uses Opus 4.6 to reason about task decomposition.
 * This is the ONLY place where the full task context lives.
 */

import type { ExecutionPlan, Phase, PlannedTask, Tool } from './types.js';

const PLANNING_PROMPT = `You are a task orchestration planner. Your job is to decompose a complex task into a phased execution plan.

## Rules
1. Break the task into the MINIMUM number of sub-tasks needed
2. Group independent tasks into parallel phases
3. Each task gets a descriptive "role" name (snake_case)
4. Each task gets a clear, self-contained description that a junior developer could follow
5. Specify which tools each task needs from the available tools
6. Specify context_tags for what blackboard data this task needs from prior phases
7. Keep task descriptions FOCUSED - include only what the agent needs to know

## Available Tools
{tools}

## Output Format
Respond with ONLY valid JSON matching this structure:
{
  "phases": [
    {
      "name": "Phase 1: Data Collection",
      "description": "What this phase accomplishes",
      "tasks": [
        {
          "role": "descriptive_role_name",
          "description": "Detailed instructions for the agent. Include what to do, how to do it, and what output to produce.",
          "inputs": {},
          "dependencies": [],
          "tools": ["tool_name"],
          "context_tags": ["tag_from_earlier_phase"]
        }
      ],
      "parallel": true
    }
  ],
  "estimated_agents": 4,
  "strategy": "Brief description of the overall approach"
}`;

/**
 * Generate an execution plan from a task description
 *
 * In production, this calls Opus 4.6 to generate the plan.
 * For now, it constructs a plan based on task analysis.
 */
export async function generatePlan(task: string, tools: Tool[]): Promise<ExecutionPlan> {
  const toolDescriptions = tools
    .map(t => `- **${t.name}** (${t.category}): ${t.description}`)
    .join('\n');

  // Build the prompt that would go to Opus
  const prompt = PLANNING_PROMPT.replace('{tools}', toolDescriptions);

  // For iteration 1: use a simple heuristic planner
  // Iteration 2 will replace this with LLM-powered planning
  return heuristicPlan(task, tools);
}

/**
 * Simple heuristic planner for iteration 1
 * Analyzes the task text and creates a reasonable plan
 */
function heuristicPlan(task: string, tools: Tool[]): ExecutionPlan {
  const lower = task.toLowerCase();
  const phases: Phase[] = [];
  const availableToolNames = tools.map(t => t.name);

  // Detect task patterns
  const needsResearch = /research|find|search|look up|investigate|analyze/i.test(task);
  const needsCode = /build|create|write|implement|code|develop|fix|refactor/i.test(task);
  const needsData = /data|database|query|fetch|scrape|collect/i.test(task);
  const needsReport = /report|summary|summarize|document|write up/i.test(task);
  const needsReview = /review|audit|check|verify|validate/i.test(task);

  // Phase 1: Research / Data Gathering (if needed)
  if (needsResearch || needsData) {
    const researchTasks: PlannedTask[] = [];

    if (needsResearch) {
      researchTasks.push({
        role: 'researcher',
        description: `Research the following topic thoroughly:\n\n${task}\n\nGather key facts, data points, and relevant information. Write findings as structured data.`,
        inputs: { query: task },
        dependencies: [],
        tools: filter(['web_search', 'web_fetch'], availableToolNames),
        context_tags: [],
      });
    }

    if (needsData) {
      researchTasks.push({
        role: 'data_collector',
        description: `Collect data relevant to:\n\n${task}\n\nFetch from available sources, clean, and structure the data.`,
        inputs: { query: task },
        dependencies: [],
        tools: filter(['web_fetch', 'shell_exec', 'postgres_query'], availableToolNames),
        context_tags: [],
      });
    }

    phases.push({
      name: 'Phase 1: Research & Data Gathering',
      description: 'Collect information and data needed for the task',
      tasks: researchTasks,
      parallel: true,
    });
  }

  // Phase 2: Implementation (if needed)
  if (needsCode) {
    const codeTasks: PlannedTask[] = [{
      role: 'implementer',
      description: `Implement the following:\n\n${task}\n\nWrite clean, well-documented code. Follow best practices. Test your work.`,
      inputs: { task },
      dependencies: needsResearch ? ['researcher'] : [],
      tools: filter(['file_read', 'file_write', 'shell_exec', 'github_cli'], availableToolNames),
      context_tags: needsResearch ? ['research', 'data'] : [],
    }];

    phases.push({
      name: needsResearch ? 'Phase 2: Implementation' : 'Phase 1: Implementation',
      description: 'Build and implement the solution',
      tasks: codeTasks,
      parallel: false,
    });
  }

  // Phase 3: Review (if needed)
  if (needsReview) {
    phases.push({
      name: `Phase ${phases.length + 1}: Review & Validation`,
      description: 'Review and validate the work',
      tasks: [{
        role: 'reviewer',
        description: `Review and validate the work done for:\n\n${task}\n\nCheck for correctness, completeness, and quality.`,
        inputs: { task },
        dependencies: needsCode ? ['implementer'] : needsResearch ? ['researcher'] : [],
        tools: filter(['file_read', 'shell_exec'], availableToolNames),
        context_tags: ['implementation', 'research'],
      }],
      parallel: false,
    });
  }

  // Final Phase: Report / Synthesis
  if (needsReport || phases.length > 1) {
    phases.push({
      name: `Phase ${phases.length + 1}: Synthesis`,
      description: 'Compile and synthesize results into final output',
      tasks: [{
        role: 'synthesizer',
        description: `Synthesize all findings and work into a final deliverable for:\n\n${task}\n\nProduce a clear, well-structured output.`,
        inputs: { task },
        dependencies: phases.at(-1)?.tasks.map(t => t.role) || [],
        tools: filter(['file_write'], availableToolNames),
        context_tags: ['research', 'data', 'implementation', 'review'],
      }],
      parallel: false,
    });
  }

  // Fallback: if no patterns matched, create a single general-purpose agent
  if (phases.length === 0) {
    phases.push({
      name: 'Phase 1: Execute',
      description: 'Execute the task',
      tasks: [{
        role: 'executor',
        description: `Complete the following task:\n\n${task}`,
        inputs: { task },
        dependencies: [],
        tools: availableToolNames,
        context_tags: [],
      }],
      parallel: false,
    });
  }

  const totalAgents = phases.reduce((sum, p) => sum + p.tasks.length, 0);

  return {
    phases,
    estimated_agents: totalAgents,
    strategy: describeStrategy(phases),
  };
}

function filter(wanted: string[], available: string[]): string[] {
  return wanted.filter(t => available.includes(t));
}

function describeStrategy(phases: Phase[]): string {
  const phaseNames = phases.map(p => p.name).join(' → ');
  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  return `${totalTasks} agents across ${phases.length} phases: ${phaseNames}`;
}
