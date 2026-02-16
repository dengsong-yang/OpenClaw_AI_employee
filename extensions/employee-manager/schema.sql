CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,                  -- UUID
    name TEXT NOT NULL,                   -- Display Name (e.g. "XiaoAi")
    slug TEXT UNIQUE NOT NULL,            -- URL-friendly ID (e.g. "xiaoai-support")
    role_description TEXT,                -- Internal description
    system_prompt TEXT NOT NULL,          -- The core personality & constraints
    enabled_skills TEXT,                  -- JSON array: ["plugin-order", "plugin-browser"]
    knowledge_sources TEXT,               -- JSON array: ["doc-manual-v1"]
    is_active BOOLEAN DEFAULT 1,          -- Enable/Disable switch
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);
