
import type { OpenClawPluginApi, OpenClawPluginServiceContext } from "../../src/plugins/types.js";
import { EmployeeManagerImpl } from "./src/manager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export default function register(api: OpenClawPluginApi) {
  let manager: EmployeeManagerImpl | undefined;

  // Register Service to init DB
  api.registerService({
    id: "employee-manager-service",
    start: async (ctx: OpenClawPluginServiceContext) => {
      try {
        const dbPath = join(ctx.stateDir, "employees.sqlite");
        api.logger.info(`Initializing Employee Manager DB at: ${dbPath}`);
        
        manager = new EmployeeManagerImpl(dbPath);
        api.logger.info("Employee Manager initialized successfully.");
      } catch (err: any) {
        api.logger.error(`Failed to initialize Employee Manager: ${err.message}`);
        // Ensure directory exists if possible? ctx.stateDir should exist.
      }
    }
  });

  // Register Tools for Agents to use (e.g. Admin Agent)
  api.registerTool({
    name: "list_employees",
    description: "List all AI employees",
    inputSchema: z.object({}),
    run: async () => {
      if (!manager) return { error: "Manager not initialized" };
      return await manager.listEmployees();
    }
  } as any);

  api.registerTool({
    name: "get_employee",
    description: "Get details of an employee",
    inputSchema: z.object({ id: z.string() }),
    run: async ({ id }: { id: string }) => {
        if (!manager) return { error: "Manager not initialized" };
        return await manager.getEmployee(id);
    }
  } as any);

  api.logger.info("========== Employee Manager Plugin Loaded (v2.0 Debug) ==========");

  // Track active runs for context persistence
  const activeRuns = new Map<string, string>(); // runId -> employeeId

  // Hook: Before Prompt Build - Intercept & Inject Context
  api.on("before_prompt_build", async (event, ctx) => {
      // DEBUG LOG
      api.logger.info(`[EmployeeManager] before_prompt_build triggered. Prompt preview: ${event.prompt.substring(0, 100)}...`);

      // 1. Check for explicit dispatch tag from UI (allow timestamp prefix, full-width colon, case-insensitive)
      const match = event.prompt.match(/@employee[:：]\s*(\S+)/i);
      
      if (!match) {
        api.logger.info("[EmployeeManager] No @employee tag found using regex /@employee[:：]\s*(\S+)/i");
        return;
      }

      const slug = match[1];
      api.logger.info(`[EmployeeManager] Detected tag for slug: ${slug}`);

      if (!manager) {
        api.logger.error("[EmployeeManager] Manager not initialized!");
        return;
      }
      
      const emp = await manager.getEmployeeBySlug(slug) || await manager.getEmployee(slug);
      
      if (!emp) {
        api.logger.warn(`[EmployeeManager] Employee '${slug}' not found in DB.`);
        // Fallback: Inform the Main Assistant about the failed lookup so it can explain to the user.
        return {
            prependContext: `[System Warning: User attempted to contact employee '${slug}', but it was not found. Please inform the user that this employee ID/Slug is invalid or does not exist.]`
        };
      }

      api.logger.info(`[EmployeeManager] Found employee: ${emp.name} (${emp.id}). Injecting context.`);

      // 2. Persist User Message
      const cleanMessage = event.prompt.replace(/@employee:\S+\s*/, '');
      await manager.addHistory(emp.id, 'user', cleanMessage);

      // 3. ISOLATION: Attempt to clear global session messages from this prompt build
      // This prevents the Global History from leaking into the Employee's context window.
      // We rely on JS array reference mutability here.
      if (Array.isArray(event.messages)) {
        api.logger.info(`[EmployeeManager] Clearing global messages count: ${event.messages.length}`);
        event.messages.length = 0;
      }

      // 4. Load History
      const history = await manager.getHistory(emp.id, 10);
      const historyText = history.length > 0 
          ? history.map(h => `${h.role === 'user' ? 'User' : emp.name}: ${h.content}`).join('\n')
          : "(No previous history)";

      // 5. Inject Context - HARDENING
      // We inject the persona into `prependContext` because it usually has higher immediate attention 
      // from the model than the System Prompt (which might be distant or forgotten).
      const forcedContext = `[SYSTEM OVERRIDE INITIATED]
--------------------------------------------------------------------------------
CRITICAL INSTRUCTION: SUSPEND DEFAULT IDENTITY ("TieTie" / "Main Assistant").
YOU ARE NOW ACTING AS: ${emp.name} (ID: ${emp.id})
--------------------------------------------------------------------------------

[YOUR ROLE]
${emp.roleDescription}

[YOUR INSTRUCTIONS]
${emp.systemPrompt}

[STRICT CONSTRAINTS]
1. You are NOT "TieTie". Do not use that name.
2. You are ${emp.name}.
3. Respond exclusively based on the above role.

[EMPLOYEE MEMORY (Private Context)]
${historyText}

[END MEMORY]
--------------------------------------------------------------------------------
Start of Employee Session:
`;

      return {
          // We still provide a system prompt, but the heavy lifting is done in prependContext.
          systemPrompt: `You are ${emp.name}. ${emp.roleDescription}`,
          
          prependContext: forcedContext
      };
  });

  // Hook: Monitor LLM Input to capture Run ID (for output binding)
  api.on("llm_input", async (event, ctx) => {
      const match = event.prompt.match(/@employee[:：]\s*(\S+)/i);
      if (match && manager) {
         const slug = match[1];
         // Quick lookup or trust the slug from prompt if we assume it's valid (optimized)
         const emp = await manager.getEmployeeBySlug(slug) || await manager.getEmployee(slug);
         if (emp) {
             api.logger.info(`[EmployeeManager] Tracking RunID ${event.runId} for employee ${emp.name}`);
             activeRuns.set(event.runId, emp.id);
         }
      }
  });

  // Hook: Monitor LLM Output to persist response
  api.on("llm_output", async (event, ctx) => {
      const employeeId = activeRuns.get(event.runId);
      if (!employeeId || !manager) return;

      api.logger.info(`[EmployeeManager] Capturing output for employee ${employeeId}`);

      const content = event.assistantTexts.join('\n');
      if (content) {
          await manager.addHistory(employeeId, 'assistant', content);
      }
      
      // Cleanup
      activeRuns.delete(event.runId);
  });
  // Register HTTP Routes
  api.registerHttpRoute({
    path: "/api/ext/employees",
    handler: async (req, res) => {
        if (!manager) {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: "Service not ready" }));
            return;
        }

        const url = new URL(req.url || "", `http://${req.headers.host}`);
        const id = url.searchParams.get("id");

        res.setHeader("Content-Type", "application/json");

        try {
            // GET /api/ext/employees -> List
            // GET /api/ext/employees?id=... -> Get One
            if (req.method === "GET") {
                if (id) {
                    const emp = await manager.getEmployee(id);
                    if (!emp) {
                        res.statusCode = 404;
                        res.end(JSON.stringify({ error: "Not found" }));
                    } else {
                        res.end(JSON.stringify(emp));
                    }
                } else {
                    const list = await manager.listEmployees();
                    res.end(JSON.stringify(list));
                }
                return;
            }

            // POST /api/ext/employees -> Create
            if (req.method === "POST") {
                const body = await readBody(req);
                const emp = await manager.createEmployee(body);
                res.statusCode = 201;
                res.end(JSON.stringify(emp));
                return;
            }

            // PUT /api/ext/employees?id=... -> Update
            if (req.method === "PUT") {
                if (!id) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: "Missing id param" }));
                    return;
                }
                const body = await readBody(req);
                const emp = await manager.updateEmployee(id, body);
                res.end(JSON.stringify(emp));
                return;
            }

            // DELETE /api/ext/employees?id=... -> Delete
            if (req.method === "DELETE") {
                if (!id) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: "Missing id param" }));
                    return;
                }
                await manager.deleteEmployee(id);
                res.statusCode = 204;
                res.end();
                return;
            }
            
            res.statusCode = 405;
            res.end();

        } catch (err: any) {
            api.logger.error(`API Error: ${err.message}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
        }
    }
  });
  api.logger.info("Employee Manager plugin registered.");
}

function readBody(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let items: Buffer[] = [];
        req.on('data', (chunk: Buffer) => items.push(chunk));
        req.on('end', () => {
            try {
                const raw = Buffer.concat(items).toString();
                if (!raw) return resolve({});
                resolve(JSON.parse(raw));
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}
