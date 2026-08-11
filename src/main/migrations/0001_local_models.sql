-- Migration: 0001_local_models.sql
-- Table for locally installed AI models

CREATE TABLE IF NOT EXISTS local_models (
    id TEXT PRIMARY KEY,
    pipeline_tag TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    path TEXT NOT NULL,
    installed_at INTEGER NOT NULL,
    last_used_at INTEGER,
    license TEXT DEFAULT '',
    min_vram REAL DEFAULT 0,
    engine TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    download_progress REAL DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_local_models_pipeline ON local_models(pipeline_tag);
CREATE INDEX IF NOT EXISTS idx_local_models_status ON local_models(status);
