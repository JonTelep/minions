-- Minions: Universal Agent Orchestration System
-- PostgreSQL Schema v1

CREATE SCHEMA IF NOT EXISTS minions;

-- Orchestration runs
CREATE TABLE minions.runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task TEXT NOT NULL,                          -- Original task description
    plan JSONB,                                 -- Execution plan (DAG)
    status TEXT NOT NULL DEFAULT 'pending',      -- pending, running, completed, failed
    result JSONB,                               -- Final synthesized result
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Individual agent tasks within a run
CREATE TABLE minions.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES minions.runs(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                          -- Agent role/name
    description TEXT NOT NULL,                   -- What this agent should do
    inputs JSONB DEFAULT '{}'::jsonb,            -- Structured inputs
    dependencies UUID[] DEFAULT '{}',            -- Task IDs this depends on
    status TEXT NOT NULL DEFAULT 'pending',      -- pending, running, completed, failed
    result JSONB,                                -- Agent output
    confidence REAL,                             -- 0.0-1.0 confidence score
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,
    error TEXT,
    retry_count INTEGER DEFAULT 0
);

-- Blackboard entries: shared knowledge between agents
CREATE TABLE minions.entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES minions.runs(id) ON DELETE CASCADE,
    key TEXT NOT NULL,                           -- Unique key within run
    value JSONB NOT NULL,                        -- The data
    written_by TEXT NOT NULL,                    -- Agent role that wrote this
    tags TEXT[] DEFAULT '{}',                    -- Searchable tags
    entity_ids TEXT[] DEFAULT '{}',              -- Related entity identifiers
    event_date DATE,                            -- When the event occurred
    created_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    UNIQUE(run_id, key)
);

-- Artifacts: files and outputs produced by agents
CREATE TABLE minions.artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES minions.runs(id) ON DELETE CASCADE,
    task_id UUID REFERENCES minions.tasks(id),
    name TEXT NOT NULL,                          -- Artifact name
    content_type TEXT NOT NULL,                  -- mime type
    content TEXT,                                -- Text content (reports, code, etc)
    file_path TEXT,                              -- Path on disk if file
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool registry: extensible capabilities
CREATE TABLE minions.tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,                   -- Tool identifier
    description TEXT NOT NULL,                   -- What this tool does
    category TEXT NOT NULL,                      -- web, file, database, api, etc
    usage TEXT NOT NULL,                         -- How to use it (instructions for agents)
    install_command TEXT,                        -- How to install (if needed)
    examples JSONB DEFAULT '[]'::jsonb,          -- Usage examples
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_tasks_run_id ON minions.tasks(run_id);
CREATE INDEX idx_tasks_status ON minions.tasks(status);
CREATE INDEX idx_entries_run_id ON minions.entries(run_id);
CREATE INDEX idx_entries_tags ON minions.entries USING GIN(tags);
CREATE INDEX idx_entries_entity_ids ON minions.entries USING GIN(entity_ids);
CREATE INDEX idx_entries_event_date ON minions.entries(event_date);
CREATE INDEX idx_entries_written_by ON minions.entries(written_by);
CREATE INDEX idx_artifacts_run_id ON minions.artifacts(run_id);
CREATE INDEX idx_tools_category ON minions.tools(category);
CREATE INDEX idx_tools_enabled ON minions.tools(enabled);
CREATE INDEX idx_runs_status ON minions.runs(status);

-- Seed default tools
INSERT INTO minions.tools (name, description, category, usage) VALUES
('web_search', 'Search the web using Brave Search API', 'web',
 'Use web_search to find information online. Pass a query string. Returns titles, URLs, and snippets.'),
('web_fetch', 'Fetch and extract content from a URL', 'web',
 'Use web_fetch to read a webpage. Pass a URL. Returns markdown content.'),
('file_read', 'Read contents of a file', 'file',
 'Read any file on the filesystem. Supports text and code files.'),
('file_write', 'Write content to a file', 'file',
 'Write or create files. Specify path and content.'),
('shell_exec', 'Execute shell commands', 'system',
 'Run any shell command. Use for installing packages, running scripts, processing data.'),
('github_cli', 'Interact with GitHub via gh CLI', 'api',
 'Use gh CLI for issues, PRs, repos. Examples: gh issue list, gh pr create, gh api.'),
('postgres_query', 'Query PostgreSQL databases', 'database',
 'Run SQL queries against PostgreSQL. Use psql or node pg client.');
