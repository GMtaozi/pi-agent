// Mock services for integration testing

/** Loose payload accepted by mock methods. */
type MockPayload = Record<string, unknown>;
/** Callback bundle captured by stream mocks. */
interface MockStreamCallbacks {
  onEvent?(event: unknown): void;
  onComplete?(response: unknown): void;
  onError?(error: Error): void;
}
import '@workforge/logging';

export class MockWorkspaceService {
  private paths = new Map<string, string>();
  register(id: string, path: string) {
    this.paths.set(id, path);
  }
  onFileChange(_id: string, _callback: (path: string) => void) {}
  getWorkspace(id: string) {
    return {
      id,
      path: '/tmp/test-workspace',
      files: new Map(),
      versions: new Map()
    };
  }
  getVersions(_path: string) {
    return [];
  }
  getVersion(_id: string, _path: string, _versionId: string) {
    return null;
  }
  async rollback(_id: string, _path: string, _versionId: string) {
    return true;
  }
  async readFile(_id: string, _path: string) {
    return 'mock file content';
  }
  async writeFile(_id: string, _path: string, _content: string) {
    return true;
  }
  async listFiles(_id: string, _dirPath: string) {
    return [];
  }
}

export class MockMemoryService {
  async store(text: string, tags?: string[]) {
    return { id: 'mock-memory-' + Date.now(), text, tags: tags || [] };
  }
  async search(_query: string) {
    return [];
  }
  listEntries() {
    return [];
  }
  addEntry(entry: { text: string; tags?: string[] }) {
    console.log('Mock addEntry called with:', JSON.stringify(entry));
    const result = { id: 'mock-memory-123', text: entry.text, tags: entry.tags || [] };
    console.log('Mock addEntry returning:', JSON.stringify(result));
    return result;
  }
}

export class MockScheduleService {
  createTask(task: MockPayload) {
    return { id: 'mock-task-' + Date.now(), ...task, status: 'scheduled' };
  }
  async getTasks() {
    return [];
  }
  listTasks(_workspaceId?: string) {
    return [];
  }
  async runTask(id: string) {
    return { id, status: 'completed' };
  }
  cancelTask(_id: string) {
    return true;
  }
  deleteTask(_id: string) {
    return true;
  }
}

export class MockGovernanceService {
  async getRules() {
    return [];
  }
  listRules() {
    return [];
  }
  async createApproval(approval: MockPayload) {
    return { id: 'mock-approval-' + Date.now(), ...approval };
  }
  async getApprovals() {
    return [];
  }
  getPendingApprovals() {
    return [];
  }
  getAuditLog(_limit: number) {
    return [];
  }
  getAuditLogByAction(_action: string, _limit: number) {
    return [];
  }
  approveRequest(_id: string, _decidedBy: string, _reason?: string) {
    return true;
  }
  rejectRequest(_id: string, _decidedBy: string, _reason: string) {
    return true;
  }
}

export class MockSettingsService {
  getApiKey(provider: string): string {
    return 'mock-api-key-' + provider;
  }
  getSettings() {
    return { theme: 'dark', notifications: true };
  }
  setApiKey(_provider: string, _key: string) {}
  removeApiKey(_provider: string): boolean {
    return true;
  }
  removeCustomProvider(_providerId: string): boolean {
    return true;
  }
  setTheme(_theme: 'light' | 'dark') {}
}


export class MockModelRuntime {
  async initialize() {}
  async generate(prompt: string, model?: string) {
    return { text: 'mock response', model: model || 'mock' };
  }
}

export class MockContextBuilder {
  async buildWorkspaceContext(_workspaceId: string, _text: string) {
    return { files: [], references: [] };
  }
}

export class MockAgentEngine {
  sessionCounter = 0;
  private streamCallbacks = new Map<string, MockStreamCallbacks>();
  async initialize() {}
  async createSession(model: string, tools: unknown[]) {
    const id = 'mock-session-' + Date.now() + '-' + (++this.sessionCounter);
    return { id, model, tools };
  }
  async prompt(sessionId: string, text: string, _context?: unknown) {
    const callbacks = this.streamCallbacks.get(sessionId);
    if (callbacks) {
      callbacks.onEvent?.({ type: 'agent_start' });
      callbacks.onEvent?.({ type: 'turn_start' });
      callbacks.onEvent?.({
        type: 'message_update',
        message: { role: 'assistant', content: [{ type: 'text', text: 'mock response' }], timestamp: Date.now() },
        assistantMessageEvent: { type: 'text_delta', delta: 'mock response' }
      });
      callbacks.onEvent?.({ type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'text', text: 'mock response' }], timestamp: Date.now() }] });
      callbacks.onComplete?.('mock response for: ' + text.slice(0, 20));
    }
    return 'mock prompt response for: ' + text.slice(0, 20);
  }
  onStreamEvent(sessionId: string, callbacks: MockStreamCallbacks): () => void {
    this.streamCallbacks.set(sessionId, callbacks);
    return () => {
      this.streamCallbacks.delete(sessionId);
    };
  }
}

export class MockMonitoringService {
  recordLog(_level: number, _service: string, _message: string, _context?: unknown, _error?: unknown) {}
  recordToolCall(_toolName: string, _duration: number, _success: boolean) {}
  recordRequest(_success: boolean, _duration: number) {}
  recordError(_message: string, _service: string) {}
  updateSystemMetrics(_memoryUsage: number, _cpuUsage: number) {}
  getMetrics() {
    return { requests: 0, errors: 0, avgResponseTime: 0 };
  }
  getMetricsSummary() {
    return {
      requests: 0,
      errors: 0,
      avgResponseTime: 0,
      uptime: 0,
      memoryUsage: 0,
      cpuUsage: 0
    };
  }
  getAlerts() {
    return [];
  }
  getHealthStatus() {
    return { status: 'healthy', uptime: 0 };
  }
  getDashboardData() {
    return {
      metrics: this.getMetricsSummary(),
      alerts: [],
      systemHealth: { status: 'healthy' }
    };
  }
  getLogs(_level?: string, _service?: string, _limit?: number) {
    return [];
  }
  searchLogs(_query: string, _limit?: number) {
    return [];
  }
  reset() {}
  acknowledgeAlert(_id: string) {}
}

export class MockSkillsService {
  list() {
    return [];
  }
  get(_id: string) {
    return null;
  }
  enable(_id: string) {
    return true;
  }
  disable(_id: string) {
    return true;
  }
  reload() {
    return;
  }
}

export class MockWorkflowEngine {
  listWorkflows() {
    return [];
  }
  registerWorkflow(workflow: MockPayload) {
    return workflow;
  }
  getWorkflow(_id: string) {
    return null;
  }
  listExecutions(_workflowId: string) {
    return [];
  }
  getExecution(_id: string) {
    return null;
  }
  async executeWorkflow(id: string, _input: unknown) {
    return { id: 'exec-' + Date.now(), workflowId: id, status: 'completed' };
  }
  cancelExecution(id: string) {
    // Return false for unknown executions to test 404 path
    if (id === 'unknown-exec') {
      return false;
    }
    return true;
  }
}

export class MockOrchestrator {
  listTasks() {
    return [];
  }
  createTask(name: string, nodes: unknown[], edges?: unknown[]) {
    return { id: 'task-' + Date.now(), name, nodes, edges: edges || [], status: 'pending' };
  }
  getTask(_id: string) {
    return null;
  }
  async runTask(id: string) {
    return { id, status: 'completed' };
  }
  async cancelTask(_id: string) {
    return true;
  }
  getWorkers() {
    return [];
  }
  getWorkerStats() {
    return [];
  }
}

export class MockDatabase {
  async query(_table: string, _sql: string, _params: unknown[] = []) {
    return { rows: [], rowsAffected: 0, lastInsertRowId: 0 };
  }
  async run(_table: string, _sql: string, _params: unknown[] = []) {
    return { rows: [], rowsAffected: 0, lastInsertRowId: 0 };
  }
  async close() {}
}

// Mock createWorkspaceTools
export const createWorkspaceTools = (_workspaceService: unknown, _workspaceId: string, _callback: unknown) => {
  return [];
};

export const createMockServices = () => ({
  workspaceService: new MockWorkspaceService(),
  memoryService: new MockMemoryService(),
  scheduleService: new MockScheduleService(),
  governanceService: new MockGovernanceService(),
  settingsService: new MockSettingsService(),
  modelRuntime: new MockModelRuntime(),
  contextBuilder: new MockContextBuilder(),
  agentEngine: new MockAgentEngine(),
  monitoring: new MockMonitoringService(),
  skills: new MockSkillsService(),
  workflowEngine: new MockWorkflowEngine(),
  orchestrator: new MockOrchestrator(),
  database: new MockDatabase()
});