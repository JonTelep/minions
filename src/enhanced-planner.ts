/**
 * Enhanced Planner - Iteration 3
 * 
 * Advanced task decomposition with smarter agent allocation,
 * better parallel execution, and improved context management.
 */

import type { ExecutionPlan, Phase, PlannedTask, Tool } from './types.js';

// Enhanced role taxonomy
const AGENT_ROLES = {
  // Research roles
  'researcher': { category: 'research', tools: ['web_search', 'web_fetch'], parallel: true },
  'data_analyst': { category: 'analysis', tools: ['postgres_query', 'web_fetch', 'shell_exec'], parallel: true },
  'security_auditor': { category: 'security', tools: ['shell_exec', 'file_read'], parallel: false },
  
  // Implementation roles  
  'architect': { category: 'design', tools: ['file_read', 'file_write'], parallel: false },
  'developer': { category: 'coding', tools: ['file_read', 'file_write', 'shell_exec', 'github_cli'], parallel: true },
  'tester': { category: 'quality', tools: ['shell_exec', 'file_read'], parallel: true },
  
  // Integration roles
  'integrator': { category: 'integration', tools: ['shell_exec', 'file_read', 'file_write'], parallel: false },
  'validator': { category: 'validation', tools: ['shell_exec', 'file_read'], parallel: false },
  'synthesizer': { category: 'synthesis', tools: ['file_write'], parallel: false }
};

// Task complexity analysis
interface TaskComplexity {
  scope: 'small' | 'medium' | 'large' | 'enterprise';
  domains: string[];
  dependencies: string[];
  parallelizable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Enhanced plan generation with sophisticated analysis
 */
export async function generateEnhancedPlan(task: string, tools: Tool[]): Promise<ExecutionPlan> {
  const complexity = analyzeTaskComplexity(task);
  const availableToolNames = tools.map(t => t.name);
  
  console.log(`[EnhancedPlanner] Task complexity: ${JSON.stringify(complexity)}`);
  
  const phases: Phase[] = [];
  let phaseCounter = 1;
  
  // Phase strategy based on complexity
  if (complexity.scope === 'enterprise' || complexity.domains.length > 3) {
    // Multi-domain complex task
    phases.push(...createMultiDomainPlan(task, complexity, availableToolNames));
  } else if (complexity.scope === 'large') {
    // Large single-domain task  
    phases.push(...createLargeTaskPlan(task, complexity, availableToolNames));
  } else {
    // Standard task decomposition
    phases.push(...createStandardPlan(task, complexity, availableToolNames));
  }
  
  // Add validation phase for high-risk tasks
  if (complexity.riskLevel === 'high') {
    phases.push(createValidationPhase(task, phases.length + 1, availableToolNames));
  }
  
  // Optimize parallel execution
  optimizeParallelExecution(phases);
  
  const totalAgents = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  
  return {
    phases,
    estimated_agents: totalAgents,
    strategy: generateStrategy(phases, complexity),
  };
}

/**
 * Analyze task complexity and characteristics
 */
function analyzeTaskComplexity(task: string): TaskComplexity {
  const lower = task.toLowerCase();
  
  // Detect domains
  const domains: string[] = [];
  if (/security|audit|vulnerability|penetration/i.test(task)) domains.push('security');
  if (/database|postgres|sql|query/i.test(task)) domains.push('database');
  if (/api|rest|graphql|endpoint/i.test(task)) domains.push('api');
  if (/frontend|ui|react|vue|angular/i.test(task)) domains.push('frontend');
  if (/backend|server|microservice/i.test(task)) domains.push('backend');
  if (/devops|docker|kubernetes|deployment/i.test(task)) domains.push('devops');
  if (/research|analyze|investigate/i.test(task)) domains.push('research');
  if (/test|testing|qa/i.test(task)) domains.push('testing');
  
  // Detect scope
  let scope: TaskComplexity['scope'] = 'small';
  if (task.length > 200 || domains.length > 2) scope = 'medium';
  if (task.length > 500 || domains.length > 3) scope = 'large';
  if (/enterprise|platform|system|architecture/i.test(task)) scope = 'enterprise';
  
  // Detect risk
  let riskLevel: TaskComplexity['riskLevel'] = 'low';
  if (/production|live|critical|security/i.test(task)) riskLevel = 'medium';
  if (/delete|remove|destroy|nuclear/i.test(task)) riskLevel = 'high';
  
  // Detect dependencies
  const dependencies: string[] = [];
  if (/after|once|when|require|depend/i.test(task)) dependencies.push('sequential');
  if (/and|also|plus|additionally/i.test(task)) dependencies.push('parallel');
  
  return {
    scope,
    domains: domains.length > 0 ? domains : ['general'],
    dependencies,
    parallelizable: !dependencies.includes('sequential'),
    riskLevel
  };
}

/**
 * Create plan for multi-domain complex tasks
 */
function createMultiDomainPlan(task: string, complexity: TaskComplexity, tools: string[]): Phase[] {
  const phases: Phase[] = [];
  
  // Phase 1: Domain Analysis (parallel)
  const analysisTasks: PlannedTask[] = complexity.domains.map(domain => ({
    role: 'domain_analyst',
    description: `Analyze the ${domain} aspects of: ${task}. Identify requirements, constraints, and dependencies specific to ${domain}.`,
    inputs: { domain, task },
    dependencies: [],
    tools: getToolsForDomain(domain, tools),
    context_tags: [],
  }));
  
  phases.push({
    name: 'Phase 1: Domain Analysis',
    description: 'Analyze each domain aspect in parallel',
    tasks: analysisTasks,
    parallel: true,
  });
  
  // Phase 2: Architecture Planning
  phases.push({
    name: 'Phase 2: Architecture Planning',
    description: 'Create unified architecture plan',
    tasks: [{
      role: 'architect',
      description: `Design the overall architecture for: ${task}. Integrate insights from domain analysis and create implementation roadmap.`,
      inputs: { task },
      dependencies: analysisTasks.map(t => t.role),
      tools: filter(['file_read', 'file_write'], tools),
      context_tags: ['domain_analysis'],
    }],
    parallel: false,
  });
  
  // Phase 3: Parallel Implementation
  const implTasks: PlannedTask[] = complexity.domains.map(domain => ({
    role: `${domain}_developer`,
    description: `Implement the ${domain} components for: ${task}. Follow the architecture plan and integrate with other components.`,
    inputs: { domain, task },
    dependencies: ['architect'],
    tools: getToolsForDomain(domain, tools),
    context_tags: ['architecture'],
  }));
  
  phases.push({
    name: 'Phase 3: Parallel Implementation',
    description: 'Implement each domain component in parallel',
    tasks: implTasks,
    parallel: true,
  });
  
  return phases;
}

/**
 * Create plan for large single-domain tasks
 */
function createLargeTaskPlan(task: string, complexity: TaskComplexity, tools: string[]): Phase[] {
  const phases: Phase[] = [];
  
  // Research phase
  phases.push({
    name: 'Phase 1: Research & Planning',
    description: 'Thorough research and detailed planning',
    tasks: [{
      role: 'researcher',
      description: `Research and plan for: ${task}. Create detailed requirements and approach.`,
      inputs: { task },
      dependencies: [],
      tools: filter(['web_search', 'web_fetch', 'file_write'], tools),
      context_tags: [],
    }],
    parallel: false,
  });
  
  // Implementation phase
  phases.push({
    name: 'Phase 2: Implementation',
    description: 'Execute the implementation',
    tasks: [{
      role: 'developer',
      description: `Implement: ${task}. Follow the research and planning guidelines.`,
      inputs: { task },
      dependencies: ['researcher'],
      tools: filter(['file_read', 'file_write', 'shell_exec', 'github_cli'], tools),
      context_tags: ['research'],
    }],
    parallel: false,
  });
  
  // Testing phase
  phases.push({
    name: 'Phase 3: Testing & Validation',
    description: 'Test and validate the implementation',
    tasks: [{
      role: 'tester',
      description: `Test and validate: ${task}. Ensure quality and correctness.`,
      inputs: { task },
      dependencies: ['developer'],
      tools: filter(['shell_exec', 'file_read'], tools),
      context_tags: ['implementation'],
    }],
    parallel: false,
  });
  
  return phases;
}

/**
 * Create standard plan for medium/small tasks
 */
function createStandardPlan(task: string, complexity: TaskComplexity, tools: string[]): Phase[] {
  const phases: Phase[] = [];
  const lower = task.toLowerCase();
  
  // Determine primary action
  if (/research|analyze|investigate/i.test(task)) {
    phases.push({
      name: 'Phase 1: Research',
      description: 'Research and analyze the topic',
      tasks: [{
        role: 'researcher',
        description: task,
        inputs: { task },
        dependencies: [],
        tools: filter(['web_search', 'web_fetch'], tools),
        context_tags: [],
      }],
      parallel: false,
    });
  }
  
  if (/build|create|implement|develop/i.test(task)) {
    const dependencies = phases.length > 0 ? ['researcher'] : [];
    phases.push({
      name: `Phase ${phases.length + 1}: Implementation`,
      description: 'Build and implement the solution',
      tasks: [{
        role: 'developer',
        description: task,
        inputs: { task },
        dependencies,
        tools: filter(['file_read', 'file_write', 'shell_exec', 'github_cli'], tools),
        context_tags: dependencies.length > 0 ? ['research'] : [],
      }],
      parallel: false,
    });
  }
  
  // Fallback: single executor
  if (phases.length === 0) {
    phases.push({
      name: 'Phase 1: Execute',
      description: 'Execute the task',
      tasks: [{
        role: 'executor',
        description: task,
        inputs: { task },
        dependencies: [],
        tools: tools,
        context_tags: [],
      }],
      parallel: false,
    });
  }
  
  return phases;
}

/**
 * Create validation phase for high-risk tasks
 */
function createValidationPhase(task: string, phaseNum: number, tools: string[]): Phase {
  return {
    name: `Phase ${phaseNum}: Validation`,
    description: 'Validate and verify all work for safety',
    tasks: [{
      role: 'validator',
      description: `Carefully validate all work done for: ${task}. Check for errors, security issues, and compliance.`,
      inputs: { task },
      dependencies: [], // Will be set based on previous phases
      tools: filter(['file_read', 'shell_exec'], tools),
      context_tags: ['implementation', 'research'],
    }],
    parallel: false,
  };
}

/**
 * Optimize parallel execution across phases
 */
function optimizeParallelExecution(phases: Phase[]) {
  phases.forEach(phase => {
    // Enable parallelization for independent tasks
    if (phase.tasks.length > 1) {
      const hasSharedDependencies = phase.tasks.some(t => 
        phase.tasks.some(other => 
          other !== t && t.dependencies.some(dep => other.dependencies.includes(dep))
        )
      );
      
      if (!hasSharedDependencies) {
        phase.parallel = true;
      }
    }
  });
}

/**
 * Get appropriate tools for a domain
 */
function getToolsForDomain(domain: string, availableTools: string[]): string[] {
  const domainTools: Record<string, string[]> = {
    security: ['shell_exec', 'file_read', 'web_fetch'],
    database: ['postgres_query', 'shell_exec', 'file_read'],
    api: ['web_fetch', 'shell_exec', 'file_read', 'file_write'],
    frontend: ['file_read', 'file_write', 'shell_exec', 'web_fetch'],
    backend: ['file_read', 'file_write', 'shell_exec', 'postgres_query'],
    devops: ['shell_exec', 'file_read', 'file_write'],
    research: ['web_search', 'web_fetch', 'file_write'],
    testing: ['shell_exec', 'file_read'],
    general: availableTools
  };
  
  return filter(domainTools[domain] || domainTools.general, availableTools);
}

/**
 * Generate strategy description
 */
function generateStrategy(phases: Phase[], complexity: TaskComplexity): string {
  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  const parallelPhases = phases.filter(p => p.parallel).length;
  
  return `${totalTasks} agents across ${phases.length} phases (${parallelPhases} parallel) - ${complexity.scope} ${complexity.domains.join('+')} task`;
}

function filter(wanted: string[], available: string[]): string[] {
  return wanted.filter(t => available.includes(t));
}