export type Employee = {
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
};

export interface EmployeeManager {
  getEmployee(id: string): Promise<Employee | null>;
  listEmployees(): Promise<Employee[]>;
  createEmployee(employee: Omit<Employee, "id" | "createdAt" | "updatedAt">): Promise<Employee>;
  updateEmployee(id: string, updates: Partial<Omit<Employee, "id">>): Promise<Employee>;
  deleteEmployee(id: string): Promise<void>;
}
