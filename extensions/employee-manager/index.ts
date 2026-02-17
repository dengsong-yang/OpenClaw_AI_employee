
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
