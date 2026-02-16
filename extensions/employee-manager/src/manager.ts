
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Employee {
  id: string; // UUID
  name: string; // Display Name (e.g. "XiaoAi")
  slug: string; // URL-friendly ID (e.g. "xiaoai-support")
  roleDescription?: string; // Internal description
  systemPrompt: string; // The core personality & constraints
  enabledSkills: string[]; // List of plugin names, e.g. ["plugin-order", "plugin-browser"]
  knowledgeSources: string[]; // List of RAG doc IDs, e.g. ["doc-manual-v1"]
  isActive: boolean; // Enable/Disable switch
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

export class EmployeeManagerImpl {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    // Locate schema relative to this file? Or relative to package root?
    // Assuming schema.sql is in ../schema.sql
    try {
        const schemaPath = join(__dirname, '../schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
    } catch (e) {
        console.error("Schema not found or failed to execute, check path relative to built JS.");
        // Fallback or skip if table exists
        this.db.exec(`CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            role_description TEXT,
            system_prompt TEXT NOT NULL,
            enabled_skills TEXT,
            knowledge_sources TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at INTEGER DEFAULT (unixepoch()),
            updated_at INTEGER DEFAULT (unixepoch())
        );`);
    }

    // Seed if empty
    const count = this.db.prepare('SELECT count(*) as c FROM employees').get() as { c: number };
    if (count.c === 0) {
        try {
            const seedPath = join(__dirname, '../seed.sql');
            const seed = readFileSync(seedPath, 'utf-8');
            this.db.exec(seed);
        } catch (e) {
            console.warn("Seed file not found, skipping seed.");
        }
    }
  }

  async getEmployee(id: string): Promise<Employee | null> {
    const row = this.db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  async listEmployees(): Promise<Employee[]> {
    const rows = this.db.prepare('SELECT * FROM employees').all() as any[];
    return rows.map(this.mapRow);
  }

  async createEmployee(employee: Omit<Employee, "createdAt" | "updatedAt">): Promise<Employee> {
    const stmt = this.db.prepare(`
      INSERT INTO employees (
        id, name, slug, role_description, system_prompt, enabled_skills, knowledge_sources, is_active, created_at, updated_at
      ) VALUES (
        @id, @name, @slug, @roleDescription, @systemPrompt, @enabledSkills, @knowledgeSources, @isActive, unixepoch(), unixepoch()
      )
    `);
    
    const skillsJson = JSON.stringify(employee.enabledSkills);
    const knowledgeJson = JSON.stringify(employee.knowledgeSources);

    stmt.run({
        ...employee,
        enabledSkills: skillsJson,
        knowledgeSources: knowledgeJson,
        isActive: employee.isActive ? 1 : 0
    });

    return (await this.getEmployee(employee.id))!;
  }

  async updateEmployee(id: string, updates: Partial<Omit<Employee, "id">>): Promise<Employee> {
    const sets: string[] = [];
    const params: any = { id };

    if (updates.name !== undefined) { sets.push("name = @name"); params.name = updates.name; }
    if (updates.slug !== undefined) { sets.push("slug = @slug"); params.slug = updates.slug; }
    if (updates.roleDescription !== undefined) { sets.push("role_description = @roleDescription"); params.roleDescription = updates.roleDescription; }
    if (updates.systemPrompt !== undefined) { sets.push("system_prompt = @systemPrompt"); params.systemPrompt = updates.systemPrompt; }
    if (updates.enabledSkills !== undefined) { sets.push("enabled_skills = @enabledSkills"); params.enabledSkills = JSON.stringify(updates.enabledSkills); }
    if (updates.knowledgeSources !== undefined) { sets.push("knowledge_sources = @knowledgeSources"); params.knowledgeSources = JSON.stringify(updates.knowledgeSources); }
    if (updates.isActive !== undefined) { sets.push("is_active = @isActive"); params.isActive = updates.isActive ? 1 : 0; }
    
    sets.push("updated_at = unixepoch()");

    const sql = `UPDATE employees SET ${sets.join(", ")} WHERE id = @id`;
    this.db.prepare(sql).run(params);

    return (await this.getEmployee(id))!;
  }

  async deleteEmployee(id: string): Promise<void> {
    this.db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  }

  private mapRow(row: any): Employee {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      roleDescription: row.role_description,
      systemPrompt: row.system_prompt,
      // Parse JSON safely or handle legacy
      enabledSkills: typeof row.enabled_skills === 'string' ? JSON.parse(row.enabled_skills) : [],
      knowledgeSources: typeof row.knowledge_sources === 'string' ? JSON.parse(row.knowledge_sources) : [],
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
