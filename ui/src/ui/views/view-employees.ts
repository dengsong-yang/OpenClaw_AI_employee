
import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

type Employee = {
  id: string;
  name: string;
  slug: string;
  roleDescription?: string;
  systemPrompt: string;
  enabledSkills: string[];
  knowledgeSources: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

@customElement("view-employees")
export class ViewEmployees extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .layout {
      display: grid;
      grid-template-columns: 300px 1fr;
      height: 100%;
      gap: 1px;
      background: var(--surface-2);
    }
    .sidebar {
      background: var(--surface-1);
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--surface-2);
    }
    .main {
      background: var(--background);
      overflow-y: auto;
      padding: 24px;
    }
    .header {
      padding: 16px;
      border-bottom: 1px solid var(--surface-2);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .title { font-weight: 600; }
    .list {
      flex: 1;
      overflow-y: auto;
    }
    .item {
      padding: 12px 16px;
      border-bottom: 1px solid var(--surface-2);
      cursor: pointer;
    }
    .item:hover { background: var(--surface-2); }
    .item.active { background: var(--primary-subtle); border-left: 3px solid var(--primary); }
    .item-name { font-weight: 500; }
    .item-role { font-size: 12px; color: var(--text-muted); }
    
    .card {
      background: var(--surface-1);
      border: 1px solid var(--surface-2);
      border-radius: 8px;
      padding: 24px;
      max-width: 800px;
    }
    .field { margin-bottom: 16px; display: block; }
    .field label { display: block; margin-bottom: 8px; font-weight: 500; }
    .field input, .field textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--surface-3);
      border-radius: 4px;
      background: var(--background);
      color: var(--text);
    }
    .row { display: flex; gap: 12px; }
  `;

  @state() employees: Employee[] = [];
  @state() selectedId: string | null = null;
  @state() loading = false;
  @state() error: string | null = null;

  @state() isEditing = false;
  @state() editForm: Partial<Employee> = {};

  async connectedCallback() {
    super.connectedCallback();
    await this.loadEmployees();
  }

  async loadEmployees() {
    this.loading = true;
    try {
      const res = await fetch('/api/ext/employees');
      if (!res.ok) throw new Error(await res.text());
      this.employees = await res.json();
      if (!this.selectedId && this.employees.length > 0) {
        this.selectedId = this.employees[0].id;
      }
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  }

  selectEmployee(id: string) {
    this.selectedId = id;
    this.isEditing = false;
  }

  startCreate() {
    this.selectedId = null;
    this.isEditing = true;
    this.editForm = {
        name: "",
        slug: "",
        roleDescription: "",
        systemPrompt: "",
        enabledSkills: [],
        knowledgeSources: [],
        isActive: true
    };
  }

  startEdit() {
      const emp = this.employees.find(e => e.id === this.selectedId);
      if (emp) {
          this.isEditing = true;
          this.editForm = { ...emp };
      }
  }

  cancelEdit() {
      this.isEditing = false;
      this.editForm = {};
      if (this.employees.length > 0 && !this.selectedId) {
          this.selectedId = this.employees[0].id; // Revert to first if cancelling create
      }
  }

  async saveEmployee() {
      // Basic validation
      if (!this.editForm.name || !this.editForm.slug || !this.editForm.systemPrompt) {
          alert("Name, Slug, and System Prompt are required.");
          return;
      }

      try {
          const isNew = !this.editForm.id;
          const url = '/api/ext/employees' + (isNew ? '' : `?id=${this.editForm.id}`);
          const method = isNew ? 'POST' : 'PUT';
          
          if (isNew) {
              // Generate ID if backend needs it, or let backend generate.
              // My backend expects ID in insert if I recall?
              // Let's check backend.
              // Backend: INSERT INTO ... VALUES (@id, ...)
              // So I must provide ID.
              if (!this.editForm.id) {
                  this.editForm.id = uuidv4();
              }
          }

          const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.editForm)
          });
          
          if (!res.ok) throw new Error(await res.text());
          
          await this.loadEmployees();
          this.selectedId = this.editForm.id!;
          this.isEditing = false;
      } catch (e: any) {
          alert(`Error saving: ${e.message}`);
      }
  }

  async deleteEmployee() {
      if (!this.selectedId || !confirm("Are you sure?")) return;
      
      try {
          await fetch(`/api/ext/employees?id=${this.selectedId}`, { method: 'DELETE' });
          await this.loadEmployees();
          this.selectedId = this.employees[0]?.id || null;
      } catch(e: any) {
          alert(e.message);
      }
  }

  render() {
    const selected = this.employees.find(e => e.id === this.selectedId);

    return html`
      <div class="layout">
        <aside class="sidebar">
          <div class="header">
            <span class="title">Employees</span>
            <button @click=${this.startCreate}>+</button>
          </div>
          <div class="list">
            ${this.loading ? html`<div style="padding:16px">Loading...</div>` : ''}
            ${this.error ? html`<div style="padding:16px; color:red">${this.error}</div>` : ''}
            ${this.employees.map(e => html`
              <div class="item ${e.id === this.selectedId ? 'active' : ''}" @click=${() => this.selectEmployee(e.id)}>
                <div class="item-name">${e.name}</div>
                <div class="item-role">${e.roleDescription}</div>
              </div>
            `)}
          </div>
        </aside>
        <main class="main">
          ${this.isEditing ? this.renderForm() : (selected ? this.renderDetails(selected) : html`<div>Select an employee</div>`)}
        </main>
      </div>
    `;
  }

  renderDetails(e: Employee) {
      return html`
        <div class="card">
            <div class="header">
                <h2>${e.name}</h2>
                <div>
                    <button @click=${this.startEdit}>Edit</button>
                    <button @click=${this.deleteEmployee} style="color:red">Delete</button>
                </div>
            </div>
            <p><strong>Slug:</strong> ${e.slug}</p>
            <p><strong>Role:</strong> ${e.roleDescription}</p>
            <p><strong>Active:</strong> ${e.isActive ? 'Yes' : 'No'}</p>
            <hr/>
            <h3>System Prompt</h3>
            <pre style="white-space: pre-wrap; background: var(--surface-2); padding: 12px;">${e.systemPrompt}</pre>
            
            <h3>Skills</h3>
            <ul>
                ${e.enabledSkills.map(s => html`<li>${s}</li>`)}
            </ul>
        </div>
      `;
  }

  renderForm() {
      return html`
        <div class="card">
            <h2>${this.editForm.id ? 'Edit' : 'Create'} Employee</h2>
            
            <div class="field">
                <label>Name</label>
                <input .value=${this.editForm.name || ''} 
                       @input=${(e: any) => this.editForm = { ...this.editForm, name: e.target.value }}>
            </div>
            
            <div class="field">
                <label>Slug (ID)</label>
                <input .value=${this.editForm.slug || ''} 
                       @input=${(e: any) => this.editForm = { ...this.editForm, slug: e.target.value }}>
            </div>

            <div class="field">
                <label>Role Description</label>
                <input .value=${this.editForm.roleDescription || ''} 
                       @input=${(e: any) => this.editForm = { ...this.editForm, roleDescription: e.target.value }}>
            </div>

            <div class="field">
                <label>System Prompt</label>
                <textarea rows="10"
                       .value=${this.editForm.systemPrompt || ''} 
                       @input=${(e: any) => this.editForm = { ...this.editForm, systemPrompt: e.target.value }}></textarea>
            </div>
            
            <div class="field">
                <label>Skills (JSON Array)</label>
                <input .value=${JSON.stringify(this.editForm.enabledSkills || [])} 
                       @change=${(e: any) => {
                           try { this.editForm = {...this.editForm, enabledSkills: JSON.parse(e.target.value)} } 
                           catch(err) { alert("Invalid JSON"); }
                       }}>
            </div>

            <div class="row">
                <button @click=${this.saveEmployee}>Save</button>
                <button @click=${this.cancelEdit}>Cancel</button>
            </div>
        </div>
      `;
  }
}

function uuidv4(): string {
  // @ts-ignore
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
