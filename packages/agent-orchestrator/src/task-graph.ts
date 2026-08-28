export interface TaskNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'parallel';
  config: Record<string, unknown>;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
}

export interface TaskGraph {
  id: string;
  name: string;
  nodes: Map<string, TaskNode>;
  edges: Array<{ from: string; to: string; condition?: string }>;
  status: 'idle' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export class TaskGraphBuilder {
  private graph: TaskGraph;

  constructor(id: string, name: string) {
    this.graph = {
      id,
      name,
      nodes: new Map(),
      edges: [],
      status: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  addNode(node: Omit<TaskNode, 'status'>): this {
    this.graph.nodes.set(node.id, {
      ...node,
      status: 'pending'
    });
    return this;
  }

  addEdge(from: string, to: string, condition?: string): this {
    this.graph.edges.push({ from, to, condition });
    return this;
  }

  build(): TaskGraph {
    this.validate();
    return this.graph;
  }

  private validate(): void {
    // Check all dependencies exist
    for (const [nodeId, node] of this.graph.nodes) {
      for (const dep of node.dependencies) {
        if (!this.graph.nodes.has(dep)) {
          throw new Error('Node ' + nodeId + ' depends on non-existent node ' + dep);
        }
      }
    }

    // Check for cycles in edges
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleInEdges = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoingEdges = this.graph.edges.filter(e => e.from === nodeId);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
          if (hasCycleInEdges(edge.to)) return true;
        } else if (recursionStack.has(edge.to)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (hasCycleInEdges(nodeId)) {
          throw new Error('Task graph contains a cycle');
        }
      }
    }

    // Check for cycles in dependencies
    const depVisited = new Set<string>();
    const depStack = new Set<string>();

    const hasCycleInDeps = (nodeId: string): boolean => {
      depVisited.add(nodeId);
      depStack.add(nodeId);

      const node = this.graph.nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          if (!depVisited.has(dep)) {
            if (hasCycleInDeps(dep)) return true;
          } else if (depStack.has(dep)) {
            return true;
          }
        }
      }

      depStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.graph.nodes.keys()) {
      if (!depVisited.has(nodeId)) {
        if (hasCycleInDeps(nodeId)) {
          throw new Error('Task graph contains a cycle');
        }
      }
    }
  }
}

export class TaskGraphExecutor {
  private graph: TaskGraph;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private results: Map<string, any> = new Map();

  constructor(graph: TaskGraph) {
    this.graph = graph;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(executeNode: (node: TaskNode) => Promise<any>): Promise<TaskGraph> {
    this.graph.status = 'running';
    this.graph.updatedAt = new Date().toISOString();

    // Topological sort
    const sorted = this.topologicalSort();
    
    // Execute in order
    for (const nodeId of sorted) {
      const node = this.graph.nodes.get(nodeId);
      if (!node) continue;

      // Skip nodes that are already in terminal state
      if (['completed', 'failed', 'cancelled', 'skipped'].includes(node.status)) {
        continue;
      }

      // Check if dependencies are satisfied
      const depsSatisfied = node.dependencies.every(depId => {
        const dep = this.graph.nodes.get(depId);
        return dep && dep.status === 'completed';
      });

      if (!depsSatisfied) {
        node.status = 'skipped';
        continue;
      }

      try {
        node.status = 'running';
        node.result = await executeNode(node);
        node.status = 'completed';
        this.results.set(nodeId, node.result);
      } catch (error) {
        node.status = 'failed';
        node.error = error instanceof Error ? error.message : String(error);
        this.graph.status = 'failed';
        this.graph.updatedAt = new Date().toISOString();
        return this.graph;
      }
    }

    this.graph.status = 'completed';
    this.graph.updatedAt = new Date().toISOString();
    return this.graph;
  }

  private topologicalSort(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) {
        throw new Error('Cycle detected in task graph');
      }
      if (visited.has(nodeId)) return;

      temp.add(nodeId);

      const node = this.graph.nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep);
        }
      }

      temp.delete(nodeId);
      visited.add(nodeId);
      sorted.push(nodeId);
    };

    for (const nodeId of this.graph.nodes.keys()) {
      visit(nodeId);
    }

    return sorted;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  getResults(): Map<string, any> {
    return this.results;
  }
}
