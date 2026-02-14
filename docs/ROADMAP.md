# Minions - 10 Iteration Roadmap

## Iteration 1: Foundation ✅ (Current)
**Goal:** Core orchestrator + blackboard + basic agent spawning
- PostgreSQL blackboard schema & client
- Orchestrator that decomposes tasks into sub-tasks
- Agent spawning via Claude Code (Sonnet)
- Basic tool registry (web-search, file-ops)
- CLI interface: `minions run "task description"`
- Working end-to-end for simple 2-3 agent tasks

## Iteration 2: Smart Planning
**Goal:** Intelligent task decomposition with DAG construction
- LLM-powered planner that generates execution DAGs
- Dependency detection between sub-tasks
- Parallel execution of independent tasks
- Task priority and ordering
- Plan visualization (ASCII DAG in terminal)

## Iteration 3: Context Optimization
**Goal:** Minimal context per agent (the KISS principle)
- Blackboard query optimization — agents get only relevant entries
- Context budget per agent (token counting)
- Summarization of large blackboard sections
- Agent receives: task + relevant context + tools — nothing else

## Iteration 4: Tool Ecosystem
**Goal:** Rich, extensible tool library
- Tool discovery: orchestrator picks tools per task
- Built-in tools: GitHub, database queries, API calls, file processing
- Custom tool registration via JSON definitions
- Tool validation and testing framework
- MCP (Model Context Protocol) integration for external tool servers

## Iteration 5: Error Recovery & Resilience
**Goal:** Robust failure handling
- Agent retry with modified prompts on failure
- Partial result recovery (use what succeeded)
- Timeout handling per agent
- Fallback strategies (simpler approach on failure)
- Dead letter queue for failed tasks

## Iteration 6: Learning & Memory
**Goal:** Cross-run learning and improvement
- Persist successful patterns in blackboard
- Agent performance tracking (success rate, speed)
- Template library for common task types
- "Lessons learned" auto-capture from failures
- Blackboard cleanup/archival for old runs

## Iteration 7: Streaming & Real-time
**Goal:** Live progress and incremental results
- Streaming output as agents complete
- Real-time progress dashboard (terminal UI)
- WebSocket API for external monitoring
- Intermediate result access while run is in progress

## Iteration 8: Multi-Orchestrator
**Goal:** Hierarchical orchestration for complex tasks
- Sub-orchestrators for complex sub-tasks
- Orchestrator can spawn another orchestrator
- Recursive task decomposition
- Budget management (token/cost limits per run)

## Iteration 9: Self-Improvement
**Goal:** Minions improves itself
- Auto-generate new tool definitions from usage patterns
- Prompt optimization based on success/failure history
- Agent specialization profiles (which agent types work best)
- A/B testing of orchestration strategies

## Iteration 10: Production Hardening
**Goal:** Ready for continuous autonomous operation
- API server mode (REST + WebSocket)
- Authentication & authorization
- Rate limiting & cost controls
- Audit logging
- Deployment automation (Dockerfile, docker-compose)
- Integration with OpenClaw for scheduled orchestration
- Monitoring & alerting on orchestration health
