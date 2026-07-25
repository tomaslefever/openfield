-- Migration: 0000_create_tables.sql
-- Create all tables for KIE Studio Desktop

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio')),
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration REAL,
    file_size INTEGER,
    prompt TEXT,
    negative_prompt TEXT,
    model_used TEXT NOT NULL,
    parameters TEXT,
    tags TEXT,
    is_favorite INTEGER DEFAULT 0,
    credits_used INTEGER,
    task_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_model ON assets(model_used);
CREATE INDEX IF NOT EXISTS idx_assets_favorite ON assets(is_favorite);
CREATE INDEX IF NOT EXISTS idx_assets_task_id ON assets(task_id);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    timeline_data TEXT NOT NULL,
    thumbnail_path TEXT,
    duration REAL,
    width INTEGER,
    height INTEGER,
    fps INTEGER DEFAULT 30,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- KIE Tasks table
CREATE TABLE IF NOT EXISTS kie_tasks (
    task_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    type TEXT NOT NULL CHECK (type IN ('image', 'video', 'upscale', 'audio')),
    payload TEXT NOT NULL,
    result_asset_id TEXT REFERENCES assets(id),
    error_message TEXT,
    progress INTEGER DEFAULT 0,
    credits_used INTEGER,
    retry_count INTEGER DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_kie_tasks_status ON kie_tasks(status);
CREATE INDEX IF NOT EXISTS idx_kie_tasks_type ON kie_tasks(type);
CREATE INDEX IF NOT EXISTS idx_kie_tasks_created_at ON kie_tasks(created_at DESC);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    nodes TEXT NOT NULL,
    edges TEXT NOT NULL,
    viewport TEXT,
    is_template INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_workflows_is_template ON workflows(is_template);
CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);

-- Workflow runs table
CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    input_data TEXT,
    output_data TEXT,
    current_node_id TEXT,
    error_message TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);