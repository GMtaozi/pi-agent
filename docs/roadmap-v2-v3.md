# Future Roadmap: V2 / V3 Evolution

> 本文档基于当前系统状态（2026-08-24 冻结版本）制定，作为后续迭代的架构设计依据。
> 当前系统完成度：功能 100%，稳定性已验证，生产就绪度 95%。

**版本历史**
- v3.0（本版）：重构章节结构，消除冗余，明确依赖关系，新增 5 项创意功能
- v2.0：补充 7 项战略建议 + Pi-mato 附录 C
- v1.0：初始路线图

---

## 1. 当前系统基线

### 1.1 已落地的核心能力

| 能力 | 状态 | 备注 |
|------|------|------|
| 消息持久化 | ✅ | SQLite + WAL 模式 |
| 审批拦截 | ✅ | review 级工具需人工批准 |
| 自动重试 workaround | ✅ | 审批通过后前端自动重发消息 |
| 全链路追踪 | ✅ | requestId 贯穿 HTTP → Agent → vendor/pi |
| 进程守护 | ✅ | PM2 单实例 fork 模式 |
| 优雅关闭 | ✅ | SIGTERM / SIGINT 监听 |
| 日志轮转 | ✅ | PowerShell 脚本自动切割压缩 |
| E2E 错误路径测试 | ✅ | 工具失败 / 审批拒绝 / 上下文压缩 |

### 1.2 已知限制

| 限制 | 影响 | 缓解措施 |
|------|------|----------|
| approvals 存储在内存 Map | 重启丢失 | V2 需持久化 |
| vendor/pi agent loop 无状态机 | 审批后无法自动恢复执行 | 前端 workaround 已缓解 |
| 单实例架构 | 无法水平扩展 | 当前 SQLite + 内存状态限制 |
| 无成本控制 | 可能被恶意使用导致费用激增 | V2 增加配额管理 |
| 无安全边界 | Shell/文件操作攻击面大 | V2 明确安全模型 |

---

## 2. V2 基础设施（并行推进）

> 目标：先做"不依赖其他模块"的基础设施，为后续核心能力铺路。
> 预计总工期：2-3 周（可并行）

### 2.1 vendor/pi Patch 管理

**问题**：V2/V3 大量涉及 vendor/pi 改造，直接修改源码会带来维护债务。

**方案 A：Patch 包（推荐）**

使用 `patch-package` 管理对 vendor/pi 的修改。

```bash
# 安装
pnpm add patch-package postinstall-postinstall --save-dev

# 修改 vendor/pi 后，生成 patch
npx patch-package vendor/pi
```

生成的 `patches/vendor+pi@0.84.1.patch`：
```diff
diff --git a/packages/agent/src/agent-loop.ts b/packages/agent/src/agent-loop.ts
index 1234567..abcdefg 100644
--- a/packages/agent/src/agent-loop.ts
+++ b/packages/agent/src/agent-loop.ts
@@ -170,7 +170,9 @@
   while (true) {
     let hasMoreToolCalls = true;
-    console.log('[AGENT-LOOP] Outer loop iteration');
+    console.log(JSON.stringify({
+      level: 'info', vendor: 'pi', sessionId: config.sessionId
+    }));
```

**自动应用**：在 `postinstall` 钩子中自动应用：
```json
{
  "scripts": {
    "postinstall": "patch-package"
  }
}
```

**版本升级时**：
```bash
# 升级 vendor/pi 后
pnpm update vendor/pi
npx patch-package vendor/pi
# 检查 patch 是否冲突，手动解决后重新生成
```

**方案 B：Fork 策略（备选）**

如果改动过于频繁或复杂，直接 Fork pi-agent 仓库。

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "github:your-org/pi-agent#v2-custom"
  }
}
```

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 引入 patch-package | 1h | 低 |
| 2. 生成当前 vendor/pi 修改的 patch | 2h | 低 |
| 3. 验证 postinstall 自动应用 | 1h | 低 |
| 4. 制定版本升级流程 | 1h | 低 |
| **总计** | **5h** | 低 |

**验收标准**：
- [ ] `pnpm install` 后 patch 自动应用
- [ ] 升级 vendor/pi 后能快速检测冲突
- [ ] 团队成员知晓 patch 管理流程

---

### 2.2 健康检查分级

**现状**：`/health` 只返回 200，无法区分"进程存活"和"服务就绪"。

**目标**：提供 K8s 友好的三级健康检查。

**设计方案**：

```
/health/liveness    → 进程是否存活（快速检查，< 100ms）
/health/readiness   → 服务是否就绪（检查 DB、LLM API 连通性，< 2s）
/health/startup     → 启动完成（检查 PM2 状态、依赖加载）
```

**实现**：

```typescript
// apps/server/src/health.ts
export async function liveness() {
  return { status: 'ok', uptime: process.uptime() };
}

export async function readiness() {
  const checks = {
    database: await checkDatabase(),
    llmApi: await checkLlmApi(),
    diskSpace: await checkDiskSpace(),
  };
  
  const isReady = Object.values(checks).every(c => c.ok);
  return {
    status: isReady ? 'ready' : 'not_ready',
    checks,
  };
}

export async function startup() {
  // 检查 PM2 状态、依赖加载、缓存预热
  return { status: 'started', version: process.env.APP_VERSION };
}
```

**路由注册**：

```typescript
server.get('/health/liveness', async () => liveness());
server.get('/health/readiness', async () => readiness());
server.get('/health/startup', async () => startup());
```

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 健康检查逻辑实现 | 2h | 低 |
| 2. 路由注册 + 测试 | 1h | 低 |
| 3. K8s liveness/readiness probe 配置 | 1h | 低 |
| **总计** | **4h** | 低 |

**验收标准**：
- [ ] `/health/liveness` < 100ms 返回
- [ ] `/health/readiness` 在 DB 断开时返回 `not_ready`
- [ ] K8s 能根据探针结果自动重启/暂停流量

---

### 2.3 数据库备份与灾备

**现状**：SQLite 单文件，无备份机制。

#### 2.3.1 自动备份

**方案 A：SQLite .backup 命令（推荐）**

```typescript
import Database from 'better-sqlite3';

async function backupDatabase(sourcePath: string, backupPath: string) {
  const source = new Database(sourcePath, { readonly: true });
  const backup = new Database(backupPath);
  
  source.backup(backup);
  
  source.close();
  backup.close();
}
```

**方案 B：文件拷贝**

```powershell
# Windows 任务计划程序
Copy-Item "D:\Project\pi-agent\apps\server\data\workforge.db" "D:\backups\workforge-$(Get-Date -Format 'yyyyMMdd').db"
```

#### 2.3.2 备份验证

```typescript
async function verifyBackup(backupPath: string): Promise<boolean> {
  try {
    const db = new Database(backupPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    db.close();
    return tables.length > 0;
  } catch {
    return false;
  }
}
```

#### 2.3.3 恢复演练

**流程**：
1. 停止服务
2. 删除当前 `workforge.db`
3. 将备份文件复制到 `workforge.db`
4. 启动服务
5. 验证数据完整性

```powershell
# restore.ps1
param($backupPath)

Write-Host "Stopping service..."
pm2 stop agent-engine

Write-Host "Restoring database..."
Copy-Item $backupPath "D:\Project\pi-agent\apps\server\data\workforge.db" -Force

Write-Host "Starting service..."
pm2 start agent-engine

Write-Host "Restore completed."
```

#### 2.3.4 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 自动备份脚本 | 2h | 低 |
| 2. 备份验证逻辑 | 2h | 低 |
| 3. 恢复演练脚本 | 2h | 低 |
| 4. 定时任务配置 | 1h | 低 |
| **总计** | **7h** | 低 |

**验收标准**：
- [ ] 每日自动备份到安全位置
- [ ] 备份文件可通过 verifyBackup 验证
- [ ] 恢复演练流程文档化且可执行

---

### 2.4 数据库选型评估（PostgreSQL vs SQLite）

**背景**：3.7（多租户支持）的架构选择取决于数据库能力。如果最终决定迁移到 PostgreSQL，那么 3.1（数据飞轮）和 3.3（成本控制）的表设计就应该直接基于 PostgreSQL，而不是 SQLite，避免后续二次迁移。

**评估维度**：

| 维度 | SQLite | PostgreSQL |
|------|--------|------------|
| 并发写入 | 单写者，WAL 模式可缓解但不根治 | 多写者，MVCC 原生支持 |
| 数据量上限 | 建议 < 10GB | TB 级无压力 |
| 向量检索 | 需 sqlite-vec 扩展 | 原生 pgvector |
| 部署复杂度 | 单文件，零运维 | 需独立进程/云服务 |
| 成本 | 低 | 中（需服务器资源） |

**决策路径**：

```
当前并发 < 10，数据量 < 5GB？
├── 是 → 继续使用 SQLite，3.7 按方案 A 实施
│   └── 在 3.7 中明确"不支持水平扩展"的长期限制
└── 否 → 启动 PostgreSQL 迁移评估
    └── 是否需要向量检索（RAG/记忆分层）？
        ├── 是 → 优先 PostgreSQL + pgvector
        └── 否 → 可考虑 SQLite + 分库分表
```

**迁移触发条件**（任一满足即启动迁移）：
- [ ] 压测显示并发 > 10 时 SQLite 写入延迟 > 100ms
- [ ] 数据量预测 6 个月内 > 10GB
- [ ] 需要向量检索能力（4.4 Agent 记忆分层）
- [ ] 需要水平扩展（多实例部署）

**如果决定迁移到 PostgreSQL**：
1. **提前到 V2 基础设施阶段**：在 2.4 中完成迁移，而非等到 3.7
2. **影响范围**：
   - 3.1 数据飞轮：`feedback`、`code_feedback` 表直接基于 PostgreSQL 设计
   - 3.3 成本控制：`usage_records` 表使用 PostgreSQL 原生类型（JSONB、数组）
   - 3.7 多租户：直接使用 PostgreSQL 行级安全（RLS）而非应用层过滤
3. **迁移步骤**：
   - 导出 SQLite 数据 → 转换 schema → 导入 PostgreSQL
   - 更新所有数据库访问代码（better-sqlite3 → pg）
   - 双写验证 → 切流 → 下线 SQLite

**如果决定继续使用 SQLite**：
1. 在 3.7 中明确"单实例限制"
2. 预留 PostgreSQL 迁移路径（表设计兼容）
3. 3.8 压测需验证 SQLite 并发上限

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 压测验证 SQLite 并发上限 | 4h | 低 |
| 2. PostgreSQL 迁移 POC（如需要） | 8h | 中 |
| 3. 数据迁移脚本 | 4h | 中 |
| 4. 应用层适配 | 4h | 中 |
| **总计** | 4-20h | 中 |

**验收标准**：
- [ ] 明确数据库选型决策（SQLite 或 PostgreSQL）
- [ ] 如果选择 PostgreSQL，迁移完成且数据一致
- [ ] 如果选择 SQLite，压测报告明确并发上限
- [ ] 后续模块（3.1/3.3/3.7）基于选型结果设计

---

## 3. V2 核心能力（按顺序推进）

> 目标：构建生产级核心能力，形成数据驱动的正向循环。
> 预计总工期：6-8 周（单人 40h/周）
> 依赖关系：3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6
> 注意：3.7（多租户）依赖 2.4（数据库选型）的决策结果。如果决定迁移到 PostgreSQL，3.7 需拆分为"迁移阶段"和"应用改造阶段"。

### 3.1 数据飞轮与反馈闭环

**战略定位**：数据飞轮是决定 Agent 长期表现和商业价值的关键基础设施，必须优先于状态机改造等体验优化项。

**核心理念**：
- 被动反馈：点赞/点踩（已完成基础实现）
- 主动反馈：在 Agent 生成代码/文件后，增加快捷评价入口
- 数据看板：`/api/admin/metrics` 提供统计，为 V3 自我进化提供原料

**冷启动策略**：

**问题**：产品初期用户量较少时，反馈数据可能不足，导致数据飞轮无法启动。

**解决方案**：

1. **合成数据生成**
   - 使用 LLM 模拟用户行为生成反馈数据
   - 设计不同的"用户角色"（如新手用户、专家用户、挑剔用户）
   - 在测试环境中运行，快速积累初始数据集

```typescript
// 合成数据生成器
interface SyntheticUser {
  role: 'novice' | 'expert' | 'critical';
  feedbackPattern: {
    positiveRate: number; // 0-1
    avgRating: number;    // 1-5
    commentLength: 'short' | 'medium' | 'long';
  };
}

async function generateSyntheticFeedback(sessionId: string, user: SyntheticUser): Promise<Feedback[]> {
  // 使用 LLM 模拟用户对 Agent 回复的评价
}
```

2. **内部测试团队**
   - 邀请 5-10 名内部用户作为"种子用户"
   - 提供激励机制（如积分、优先体验新功能）
   - 每周收集反馈并快速迭代

3. **渐进式激活**
   - 第一阶段：仅内部用户可见反馈入口
   - 第二阶段：邀请 100 名 Beta 用户
   - 第三阶段：全量开放

**验收标准**：
- [ ] 冷启动阶段（< 100 条反馈）时，系统仍能提供基本的数据看板
- [ ] 合成数据与真实数据格式一致，可直接用于模型训练
- [ ] 内部测试团队机制可持续运行

#### 3.1.1 被动反馈增强

**现状**：已有基础 👍/👎 按钮。

**升级方案**：

1. **后端 schema 扩展**
   ```sql
   CREATE TABLE feedback (
     id TEXT PRIMARY KEY,
     sessionId TEXT NOT NULL,
     messageId TEXT NOT NULL,
     rating INTEGER NOT NULL, -- 1: 点赞, -1: 点踩, 0: 中性
     comment TEXT,
     feedbackType TEXT DEFAULT 'quick', -- 'quick' | 'detailed'
     createdAt TEXT NOT NULL
   );
   
   CREATE INDEX idx_feedback_session ON feedback(sessionId);
   CREATE INDEX idx_feedback_rating ON feedback(rating);
   ```

2. **前端快捷评价**
   ```tsx
   // 每条 assistant 消息下方
   <div className="feedback-actions">
     <button onClick={() => sendFeedback(messageId, 1)}>👍</button>
     <button onClick={() => sendFeedback(messageId, -1)}>👎</button>
     <button onClick={() => showDetailedFeedback(messageId)}>💬</button>
   </div>
   ```

3. **反馈收集时机**
   - 用户看到 assistant 回复后立即显示
   - 5 分钟后自动隐藏（避免干扰）

#### 3.1.2 主动反馈（代码/文件生成后）

**场景**：Agent 生成代码、配置文件、文档后，用户无需打字即可评价。

**UI 设计**：
```tsx
// 代码块下方
<div className="code-feedback">
  <span>这段代码：</span>
  <button onClick={() => sendCodeFeedback(messageId, 'runnable')}>✅ 可运行</button>
  <button onClick={() => sendCodeFeedback(messageId, 'needs_fix')}>🔧 需修改</button>
  <button onClick={() => sendCodeFeedback(messageId, 'wrong')}>❌ 完全错误</button>
</div>
```

**后端处理**：
```typescript
interface CodeFeedback {
  messageId: string;
  sessionId: string;
  rating: 'runnable' | 'needs_fix' | 'wrong';
  context?: string; // 代码片段 hash
}

server.post('/api/sessions/:id/code-feedback', async (req, res) => {
  const { messageId, rating, context } = req.body;
  await db.insert('code_feedback', {
    id: generateId(),
    sessionId: req.params.id,
    messageId,
    rating,
    context,
    createdAt: new Date().toISOString()
  });
  res.send({ ok: true });
});
```

#### 3.1.3 数据看板（/api/admin/metrics）

**核心指标**：

| 指标 | 计算方式 | 用途 |
|------|----------|------|
| 模型使用量 | 按 model + provider 分组统计 | 成本分摊 |
| 平均轮次 | 单 session 平均 tool_execution 次数 | 复杂度评估 |
| 工具调用成功率 | success / total | 工具质量 |
| 高频错误工具 | TOP 10 isError 工具 | 优先修复 |
| 用户满意度 | avg(rating) | Agent 效果 |
| 代码采纳率 | runnable / (runnable + needs_fix + wrong) | 生成质量 |

**实现**：
```typescript
server.get('/api/admin/metrics', async (req, res) => {
  const metrics = {
    modelUsage: await db.query(`
      SELECT model, provider, COUNT(*) as count 
      FROM sessions 
      GROUP BY model, provider 
      ORDER BY count DESC
    `),
    toolSuccessRate: await db.query(`
      SELECT tool, 
        SUM(CASE WHEN isError = 0 THEN 1 ELSE 0 END) as success,
        COUNT(*) as total
      FROM tool_executions
      GROUP BY tool
      ORDER BY success / total ASC
    `),
    userSatisfaction: await db.query(`
      SELECT AVG(rating) as avgRating, 
        COUNT(*) as totalFeedback
      FROM feedback
    `),
    codeAdoption: await db.query(`
      SELECT rating, COUNT(*) as count
      FROM code_feedback
      GROUP BY rating
    `)
  };
  res.send(metrics);
});
```

#### 3.1.4 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. feedback / code_feedback 表设计 | 2h | 低 |
| 2. 后端 API 实现 | 4h | 低 |
| 3. 前端反馈 UI | 4h | 低 |
| 4. /api/admin/metrics 实现 | 4h | 低 |
| 5. 数据验证与校准 | 2h | 低 |
| **总计** | **16h** | 低 |

**验收标准**：
- [ ] 用户可对 assistant 消息进行 👍/👎 评价
- [ ] 代码块下方显示"可运行/需修改/完全错误"按钮
- [ ] `/api/admin/metrics` 返回 6 项核心指标
- [ ] 数据看板数据与数据库实际记录一致

---

### 3.2 模型路由（小/大/视觉模型分离）

**目标**：根据任务复杂度自动选择不同模型，实现成本与质量的平衡。

**设计思路**：

| 模型角色 | 用途 | 推荐配置 | 触发条件 |
|----------|------|----------|----------|
| 小工具模型 | 标题生成、轻量分类、简单问答 | deepseek-chat / gpt-3.5-turbo | 任务 < 3 步，无工具调用，简单 prompt |
| 大工具模型 | 活动摘要、任务拆解、复杂推理 | deepseek-reasoner / gpt-4 | 任务 > 3 步，需要工具调用或深度推理 |
| 视觉辅助模型 | 图像理解、多模态任务 | gpt-4-vision / step-3.7-flash | 用户输入包含图像或视觉请求 |

**实现方案**：

```typescript
// packages/agent-engine/src/model-router.ts
export class ModelRouter {
  constructor(
    private config: {
      smallModel: string;
      largeModel: string;
      visionModel?: string;
    }
  ) {}

  async selectModel(context: RouterContext): Promise<string> {
    // 1. 如果有图像输入 → 返回视觉模型
    if (context.hasImages) return this.config.visionModel || this.config.largeModel;
    
    // 2. 估算任务复杂度
    const complexity = this.estimateComplexity(context);
    
    // 3. 简单任务 → 小模型
    if (complexity < 3 && !context.hasTools) {
      return this.config.smallModel;
    }
    
    // 4. 复杂任务 → 大模型
    return this.config.largeModel;
  }

  private estimateComplexity(context: RouterContext): number {
    // 基于 prompt 长度、工具数量、历史轮次等综合估算
    let score = 0;
    score += Math.min(context.prompt.length / 500, 5);
    score += context.tools.length * 0.5;
    score += context.turnCount * 0.3;
    return Math.min(score, 10);
  }
}
```

**配置扩展（AgentEngine 构造函数）**：

```typescript
interface AgentEngineOptions {
  // ... 现有字段
  modelRouter?: {
    smallModel: string;
    largeModel: string;
    visionModel?: string;
    threshold?: number; // 默认 3
  };
}
```

**前端配置界面（参考 Pi-mato）**：

```
┌─────────────────────────────────────────────────────┐
│  模型路由配置                                        │
│  ├─ 小工具模型: [DeepSeek V4 Flash ▼]              │
│  │  生成标题、轻量分类等简单任务                     │
│  ├─ 大工具模型: [DeepSeek V4 Pro ▼]               │
│  │  活动摘要、任务拆解等需要理解力的场景             │
│  └─ 视觉辅助模型: [GPT-4 Vision ▼]                │
│      [x] 启用视觉辅助                               │
└─────────────────────────────────────────────────────┘
```

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. ModelRouter 类实现 | 4h | 低 |
| 2. AgentEngine 集成 | 2h | 低 |
| 3. 前端配置界面 | 2h | 低 |
| **总计** | **8h** | 低 |

**验收标准**：
- [ ] 简单任务自动路由到小模型
- [ ] 复杂任务自动路由到大模型
- [ ] 包含图像的任务路由到视觉模型
- [ ] 前端可手动覆盖自动路由结果

**依赖**：3.1（成本数据用于模型选择优化）

---

### 3.3 成本控制与配额管理

**战略重要性**：对于生产级商业系统，成本失控是致命风险。一个恶意用户或一个死循环，可能在几小时内消耗数千美元的 API 费用。

**依赖**：3.1（usage_records 数据基础）

#### 3.3.1 预算控制

**设计**：为每个租户/Workspace 设置月度/日度预算上限（Hard/Soft limit）。

```typescript
interface BudgetConfig {
  tenantId: string;
  dailyLimit: number;    // 美元
  monthlyLimit: number;  // 美元
  alertThreshold: number; // 0.8 = 80% 时告警
}

class BudgetManager {
  async checkBudget(tenantId: string, estimatedCost: number): Promise<boolean> {
    const usage = await this.getTodayUsage(tenantId);
    if (usage + estimatedCost > this.config.dailyLimit) {
      // Hard limit: 拒绝请求
      throw new Error('Daily budget exceeded');
    }
    if (usage + estimatedCost > this.config.dailyLimit * this.config.alertThreshold) {
      // Soft limit: 告警但允许继续
      await this.sendAlert(tenantId, 'approaching_budget');
    }
    return true;
  }
}
```

**预算超限处理**：
- 达到 80%：发送邮件/Webhook 告警
- 达到 100%：暂停新会话，现有会话继续完成
- 达到 120%：强制终止所有 Agent 循环

#### 3.3.2 计量与计费

**记录内容**：
```typescript
interface UsageRecord {
  requestId: string;
  sessionId: string;
  tenantId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number; // 美元
  timestamp: string;
}
```

**成本估算**（参考公开 API 定价）：
```typescript
const MODEL_PRICING = {
  'deepseek-chat': { input: 0.000001, output: 0.000002 }, // $1/M input, $2/M output
  'step-3.7-flash': { input: 0.000002, output: 0.000004 },
  'gpt-4': { input: 0.00003, output: 0.00006 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}
```

**持久化**：
```sql
CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  requestId TEXT NOT NULL,
  sessionId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  inputTokens INTEGER NOT NULL,
  outputTokens INTEGER NOT NULL,
  cost REAL NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX idx_usage_tenant ON usage_records(tenantId, timestamp);
CREATE INDEX idx_usage_session ON usage_records(sessionId);
```

#### 3.3.3 速率限制增强

**当前**：IP 级限流（30 次/分钟）。

**新增**：Token 级限流。

```typescript
// 在 AgentEngine.prompt() 入口处
async prompt(sessionId, text, options) {
  const estimatedTokens = estimateTokens(text);
  const requestId = options?.requestId;
  
  // 检查单次请求 Token 上限
  if (estimatedTokens > 100000) {
    throw new Error('Request exceeds maximum token limit (100k)');
  }
  
  // 检查日度 Token 配额
  const dailyUsage = await usageRepository.getDailyUsage(tenantId);
  if (dailyUsage + estimatedTokens > DAILY_TOKEN_LIMIT) {
    throw new Error('Daily token quota exceeded');
  }
  
  // ... 继续执行
}
```

#### 3.3.4 成本可见性

**日志记录**：
```typescript
this.logger.info('[Cost] API call', {
  requestId,
  sessionId,
  model,
  inputTokens,
  outputTokens,
  estimatedCost: estimateCost(model, inputTokens, outputTokens)
});
```

**前端展示**（可选）：
```
💰 本次请求预估成本：$0.002
📊 今日已用：$0.15 / $1.00 (15%)
```

#### 3.3.5 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. UsageRecord 表设计 + 迁移 | 4h | 中 |
| 2. BudgetManager 实现 | 4h | 中 |
| 3. Token 级限流集成 | 4h | 中 |
| 4. /api/admin/billing 接口 | 4h | 低 |
| 5. 前端成本展示（可选） | 4h | 低 |
| **总计** | **20h** | 中 |

**验收标准**：
- [ ] 每次 LLM 调用记录 input/output tokens 和成本
- [ ] 单租户日度预算可配置
- [ ] 预算达 80% 时发送告警
- [ ] 预算达 100% 时拒绝新请求

---

### 3.4 安全纵深防御与数据资产保护

**战略背景**：当前系统具备执行 Shell 和读写文件的能力，这是巨大的攻击面。必须在 V2 阶段明确安全边界。

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. SafeFileSystem 实现 | 4h | 中 |
| 2. 危险命令黑名单 | 2h | 低 |
| 3. 环境变量剥离 | 2h | 低 |
| 4. 敏感文件保护 | 2h | 低 |
| 5. 审批增强 | 2h | 低 |
| **总计** | **12h** | 中 |

#### 3.4.1 文件系统安全

**原则**：Agent 所有文件操作必须限制在 workspace 目录下。

```typescript
class SafeFileSystem {
  private readonly rootPath: string;
  
  resolvePath(workspaceId: string, relativePath: string): string {
    const root = path.join(this.rootPath, workspaceId);
    const resolved = path.resolve(root, relativePath);
    
    // 防止路径穿越攻击
    if (!resolved.startsWith(root)) {
      throw new Error(`Access denied: ${relativePath} escapes workspace`);
    }
    
    return resolved;
  }
  
  isSensitiveFile(filePath: string): boolean {
    const sensitivePatterns = [
      /\.env$/,
      /\.env\..*$/,
      /id_rsa/,
      /\.pem$/,
      /\.key$/,
      /\.secret$/,
      /credentials\.json$/,
      /\.git\/config$/,
    ];
    return sensitivePatterns.some(p => p.test(filePath));
  }
}
```

**规则**：
- ✅ 允许：`workspace/project/src/index.ts`
- ❌ 拒绝：`../../../etc/passwd`
- ❌ 拒绝：`/Users/admin/.ssh/id_rsa`

#### 3.4.2 命令执行安全

**危险命令黑名单**：
```typescript
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'chmod -R 777 /',
  'sudo',
  'su -',
  'dd if=',
  'mkfs',
  'fdisk',
  'iptables -F',
  'curl | sh',
  'wget | sh',
];

function isDangerousCommand(command: string): boolean {
  const normalized = command.toLowerCase().trim();
  return DANGEROUS_COMMANDS.some(dangerous => 
    normalized.includes(dangerous.toLowerCase())
  );
}
```

**环境变量剥离**：
```typescript
const SENSITIVE_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AZURE_CLIENT_SECRET',
  'GITHUB_TOKEN',
  'NPM_TOKEN',
];

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const sanitized = { ...env };
  for (const key of SENSITIVE_ENV_VARS) {
    delete sanitized[key];
  }
  return sanitized;
}
```

**审批增强**：即使审批通过，危险命令也应被拒绝。
```typescript
if (isDangerousCommand(command)) {
  return {
    content: [{ type: 'text', text: 'This command is blocked for security reasons.' }],
    isError: true,
    requiresApproval: false, // 不需要审批，直接拒绝
  };
}
```

#### 3.4.3 敏感数据保护

**.env 文件静默拒绝**：
```typescript
// 在 read_file 工具中
if (filePath.match(/\.env(\.|$)/)) {
  return {
    content: [{ type: 'text', text: '[Access denied: .env files are protected]' }],
    isError: false, // 不是错误，只是拒绝
    metadata: { blocked: true, reason: 'sensitive_file' }
  };
}
```

**密钥扫描**（可选）：
```typescript
// 在文件读取后，扫描是否包含密钥模式
const SECRET_PATTERNS = [
  /(?:secret|password|api_key|token|auth)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}['"]?/i,
];

function scanForSecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const pattern of SECRET_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      matches.push({ pattern: pattern.source, line: content.substring(0, match.index).split('\n').length });
    }
  }
  return matches;
}
```

**验收标准**：
- [ ] 文件操作限制在 workspace 目录内
- [ ] `.env` 文件读取被静默拒绝
- [ ] 危险命令（`rm -rf /`、`sudo` 等）被拦截
- [ ] 执行 bash 时敏感环境变量被剥离

---

### 3.5 可观测性统一方案

**目标**：合并原 3.3（监控告警）和 3.4.3（数据看板），形成从"异常追踪"到"指标分析"的完整可观测性体系。

#### 3.5.1 异常追踪（Sentry）

**现状**：被动排错，依赖日志 grep。

**升级方案**：

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// 在 createServer 中集成
server.addHook('onError', async (request, reply, error) => {
  Sentry.captureException(error, {
    tags: {
      requestId: request.requestId,
      sessionId: request.params.id,
    },
  });
});
```

**收益**：自动聚合错误，按 `requestId` / `sessionId` 检索。

#### 3.5.2 指标监控（Prometheus）

```typescript
import { Counter, Histogram } from 'prom-client';

const requestDuration = new Histogram({
  name: 'agent_request_duration_seconds',
  labelNames: ['sessionId', 'status'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
});

const toolExecutions = new Counter({
  name: 'agent_tool_executions_total',
  labelNames: ['tool', 'status'],
});

// 在 AgentEngine 中埋点
this.logger.info('[Tool] post-execution', {
  tool: tool.name,
  duration,
  isError: result?.isError,
  // ... 现有字段
});

toolExecutions.inc({ tool: tool.name, status: result?.isError ? 'error' : 'success' });
```

**暴露端点**：
```typescript
server.get('/metrics', async (req, res) => {
  res.header('Content-Type', register.contentType);
  res.send(await register.metrics());
});
```

#### 3.5.3 告警规则（Prometheus Alertmanager）

```yaml
groups:
  - name: agent_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(agent_tool_executions_total{status="error"}[5m]) > 0.1
        for: 2m
        annotations:
          summary: "工具错误率过高"
          
      - alert: RequestTimeout
        expr: histogram_quantile(0.95, agent_request_duration_seconds) > 120
        for: 5m
        annotations:
          summary: "请求 P95 延迟超过 120s"
```

#### 3.5.4 模型行为审计

**现状**：可观测性侧重于技术指标（延迟、错误率）和用户反馈，缺乏对模型决策过程的审计能力。

**目标**：记录每次 Agent 决策的"思考链"（Chain of Thought）或关键推理依据，在出现敏感问题（如错误删除文件）时，能快速定位是模型误判还是工具执行问题。

**设计方案**：

1. **思考链记录**
   - 在 `agent-loop.ts` 中增加 `thought_process` 字段
   - 记录模型每次决策的关键依据（如"用户要求删除文件，但未指定路径"）
   - 存储到 `agent_events` 表的 `metadata` 字段

```typescript
interface AgentEvent {
  type: 'thought' | 'tool_call' | 'tool_result';
  content: string;
  reasoning?: string; // 模型的思考过程
  confidence?: number; // 模型对决策的置信度
}
```

2. **敏感操作审计**
   - 当 Agent 执行高风险操作（删除文件、执行 bash）时，强制记录完整决策链
   - 包括：用户原始请求 → Agent 理解 → 工具选择 → 参数构造 → 执行结果

3. **审计日志查询**
   ```typescript
   GET /api/admin/audit?sessionId=xxx&eventType=thought
   ```

4. **与会话轨迹的区别**
   - 会话轨迹（4.1）：展示"做了什么"（时间线）
   - 模型行为审计：展示"为什么这么做"（决策链）

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. agent-loop.ts 增加 thought 事件 | 4h | 低 |
| 2. 审计日志存储与查询 API | 4h | 低 |
| 3. 前端审计日志查看器 | 4h | 低 |
| **总计** | **12h** | 低 |

**验收标准**：
- [ ] 每次 Agent 决策都记录 reasoning 字段
- [ ] 高风险操作（删除、bash）的决策链完整可追溯
- [ ] 可通过 API 查询任意 session 的审计日志
- [ ] 审计日志不影响正常性能（< 5% 开销）

#### 3.5.5 数据看板（/api/admin/metrics）

**核心指标**（与 3.1.3 合并，避免重复）：

| 指标 | 计算方式 | 用途 |
|------|----------|------|
| 模型使用量 | 按 model + provider 分组统计 | 成本分摊 |
| 工具调用成功率 | success / total | 工具质量 |
| 用户满意度 | avg(rating) | Agent 效果 |
| 高频错误工具 | TOP 10 isError 工具 | 优先修复 |
| 请求 P95 延迟 | histogram_quantile(0.95) | 性能监控 |
| 错误率趋势 | 按 5 分钟窗口统计 | 异常检测 |

**实现**：
```typescript
server.get('/api/admin/metrics', async (req, res) => {
  const metrics = {
    modelUsage: await db.query(`SELECT model, provider, COUNT(*) as count FROM sessions GROUP BY model, provider`),
    toolSuccessRate: await db.query(`SELECT tool, SUM(CASE WHEN isError = 0 THEN 1 ELSE 0 END) as success, COUNT(*) as total FROM tool_executions GROUP BY tool`),
    userSatisfaction: await db.query(`SELECT AVG(rating) as avgRating, COUNT(*) as totalFeedback FROM feedback`),
    requestLatency: await getLatencyPercentiles(),
    errorRate: await getErrorRate(),
  };
  res.send(metrics);
});
```

#### 3.5.5 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. Sentry SDK 集成 + DSN 配置 | 2h | 低 |
| 2. Prometheus 指标暴露 | 4h | 低 |
| 3. Grafana Dashboard 搭建 | 4h | 低 |
| 4. 告警规则配置 | 2h | 低 |
| 5. /api/admin/metrics 实现 | 4h | 低 |
| **总计** | **16h** | 低 |

**验收标准**：
- [ ] Sentry 能捕获未处理的异常，并携带 requestId
- [ ] `/metrics` 端点返回 Prometheus 格式指标
- [ ] Grafana Dashboard 展示关键指标
- [ ] 告警规则能在错误率升高时触发通知
- [ ] `/api/admin/metrics` 返回 6 项核心指标

---

### 3.6 agent loop 状态机改造

**触发条件**（满足其一即可启动）：
1. V2 数据飞轮（3.1）运转后，真实数据表明"审批后自动重提交 workaround"不够用（如用户投诉上下文丢失、重复执行风险）。
2. **或技术预研（Spike）已完成，确认改造方案可行**：即使数据飞轮尚未收集足够反馈，也可提前进行技术可行性验证，避免"数据不够 → 无法启动 → 技术风险悬而未决"的僵局。

**当前问题**：
- 审批通过后，前端重发消息导致上下文重新加载
- 无法实现"暂停 → 恢复"的原生体验
- 重复执行可能产生副作用（如重复写入文件）

**技术预研（Spike）**（约 4 小时，可选但推荐）：
- 目标：验证 vendor/pi agent loop 是否支持暂停/恢复机制
- 方法：在 `agent-loop.ts` 中实现最小化 POC，测试审批暂停 → 恢复的完整流程
- 产出：技术可行性报告 + 风险评估
- 决策点：如果 Spike 发现改造难度极大（如需要重写核心循环），则重新评估替代方案

**设计方案**：

#### 3.6.1 状态机扩展

在 `vendor/pi/packages/agent/src/agent-loop.ts` 中新增 `waitForApproval` 状态：

```typescript
type AgentLoopState = 'running' | 'waiting_for_approval' | 'stopped';

interface AgentLoopConfig {
  // ... 现有字段
  onApprovalRequired?: (context: ApprovalContext) => Promise<ApprovalDecision>;
}
```

#### 3.6.2 审批拦截点

在 `executeToolCalls` 中，当 governance 返回 `review` 级别时：

```typescript
if (decision.level === 'review') {
  // 1. 暂停 agent loop
  state = 'waiting_for_approval';
  
  // 2. 发出审批请求事件
  await emit({
    type: 'approval_required',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args: toolCall.arguments
  });
  
  // 3. 等待用户决策（通过 SSE / WebSocket）
  const decision = await config.onApprovalRequired?.({
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args: toolCall.arguments
  });
  
  // 4. 恢复执行或拒绝
  state = 'running';
  if (decision.approved) {
    // 继续执行工具
  } else {
    // 返回错误结果
  }
}
```

#### 3.6.3 前端配合

- 收到 `approval_required` 事件后，显示审批 UI
- 用户点击"允许/拒绝"后，通过 `POST /api/approvals/:id/decide` 发送决策
- Agent loop 恢复执行，无需重发消息

#### 3.6.4 技术预研（Spike）

> 推荐在正式实施前进行，以降低技术风险。

| 步骤 | 工作量 | 产出 |
|------|--------|------|
| 1. 分析 vendor/pi agent-loop.ts 暂停/恢复可行性 | 2h | 技术可行性报告 |
| 2. 实现最小化 POC（审批暂停 → 恢复） | 2h | 可运行的演示代码 |
| 3. 评估替代方案（如 SSE 双向通信 vs WebSocket） | 2h | 方案对比文档 |
| **总计** | **4h** | 降低正式实施风险 |

**决策点**：
- POC 成功 → 进入正式实施（3.6.5）
- POC 发现重大障碍 → 重新评估替代方案或推迟到 V3

#### 3.6.5 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 修改 `AgentLoopConfig` 接口 | 2h | 低（仅扩展） |
| 2. 实现 `waitForApproval` 状态机 | 4h | 中（需处理并发） |
| 3. 前端 SSE 双向通信 | 4h | 中（需处理断线重连） |
| 4. 测试覆盖（批准/拒绝/超时） | 4h | 低 |
| **总计** | **14h** | 中 |

**验收标准**：
- [ ] 审批请求发出后，agent loop 暂停而不是继续
- [ ] 用户批准后，agent loop 从暂停点恢复执行
- [ ] 用户拒绝后，返回错误结果而不是无限等待
- [ ] 前端无需重发消息即可恢复执行

**回滚策略**：保留前端 workaround 作为 fallback，状态机失败时自动降级。

---

### 3.7 多租户支持

**触发条件**：需要为多个团队/用户隔离会话数据。

**前置评估**：当前系统是单实例 + SQLite + 内存 Map。多租户要求跨进程状态共享，需先评估是否迁移到 Redis/PostgreSQL。

**评估结论的决策路径**：

```
压测结果：SQLite 并发写入是否成为瓶颈？
├── 否（并发 < 10，延迟 < 2s）→ 继续使用 SQLite
│   └── 结论：SQLite + 单实例可满足当前需求
│       └── 注意：需在文档中明确"不支持水平扩展"的长期限制
└── 是（并发 > 10 或延迟激增）→ 评估 PostgreSQL
    └── 数据量 > 10GB 或并发 > 50？
        ├── 是 → 迁移到 PostgreSQL + Redis
        │   └── 架构变更：从无状态单实例变为有状态分布式系统
        │       └── 影响：3.1（数据飞轮）、3.3（成本控制）表设计需基于 PostgreSQL
        └── 否 → SQLite + 优化（连接池、WAL、读写分离）
            └── 结论：暂不迁移，但预留 PostgreSQL 迁移路径
```

**评估清单**：
- [ ] 当前 SQLite 并发写入是否成为瓶颈？（压测验证，见 3.8）
- [ ] 内存 Map 中的 approvals/会话状态如何跨进程共享？
  - 选项 A：继续单实例，限制并发
  - 选项 B：引入 Redis 做分布式缓存
  - 选项 C：迁移到 PostgreSQL，使用行级锁
- [ ] 数据量增长预测：> 10GB 或并发 > 50 时迁移到 PostgreSQL
- [ ] **决策点**：如果决定迁移到 PostgreSQL，是否将迁移提前到 V2 基础设施阶段（第 2 章）？

**设计方案**：

#### 3.7.1 数据层隔离

**方案 A：SQLite + 租户 ID 前缀（短期推荐）**
```sql
-- 所有表增加 tenant_id 字段
ALTER TABLE sessions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE messages ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE approvals ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- 创建复合索引
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id, workspaceId);
CREATE INDEX idx_messages_tenant ON messages(tenant_id, sessionId);
```

**方案 B：PostgreSQL + Redis（远期）**
- 当数据量 > 10GB 或并发 > 50 时迁移
- 使用 `pgvector` 支持语义搜索
- 使用 Redis 做分布式锁和缓存
- **注意**：如果选择此方案，需将迁移提前到 V2 基础设施阶段，因为 3.1（数据飞轮）和 3.3（成本控制）的表设计应直接基于 PostgreSQL

#### 3.7.2 应用层隔离

```typescript
// Fastify 插件：从 JWT / API Key 提取 tenantId
server.addHook('onRequest', async (request, reply) => {
  const tenantId = request.headers['x-tenant-id'] || 'default';
  (request as any).tenantId = tenantId;
  
  // 绑定到当前请求的数据库连接
  request.db = db.withTenant(tenantId);
});

// AgentEngine 支持 tenantId
class AgentEngine {
  async createSession(tenantId: string, model: string, ...): Promise<SessionInfo> {
    // 租户级会话隔离
  }
}
```

#### 3.7.3 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 数据库迁移：增加 tenant_id | 4h | 中（需数据迁移） |
| 2. Fastify 租户提取插件 | 2h | 低 |
| 3. AgentEngine 租户感知 | 4h | 中 |
| 4. 前端多 workspace 切换 | 4h | 低 |
| **总计** | **14h** | 中 |

**验收标准**：
- [ ] 不同 tenantId 的会话完全隔离
- [ ] 前端可切换 workspace/tenant
- [ ] 数据库查询自动带上 tenant_id 过滤

---

### 3.8 性能基准与压力测试

**触发条件**：需要量化系统瓶颈，为架构优化提供数据支持。

#### 3.8.1 关键指标

| 指标 | 目标值 | 测试方法 |
|------|--------|----------|
| 并发会话数 | 10 / 50 / 100 | k6 / artillery |
| 平均响应时间 | < 5s | 95% 请求 |
| P95 响应时间 | < 15s | 工具执行场景 |
| 上下文长度衰减 | 100k tokens 时 < 2x 延迟 | 逐步增加上下文 |
| 工具调用成功率 | > 95% | 排除模型错误 |

#### 3.8.2 压测工具

**方案 A：k6（推荐）**

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },  //  ramp up
    { duration: '5m', target: 10 },  //  steady state
    { duration: '2m', target: 50 },  //  ramp to 50
    { duration: '5m', target: 50 },  //  steady state
    { duration: '2m', target: 0 },   //  ramp down
  ],
};

export default function () {
  const sessionRes = http.post('http://localhost:3001/api/v1/sessions', JSON.stringify({
    model: 'step-3.7-flash',
    mode: 'standard',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(sessionRes, { 'session created': (r) => r.status === 200 });
  const sessionId = sessionRes.json('session.id');
  
  const messageRes = http.post(`http://localhost:3001/api/v1/sessions/${sessionId}/message`, JSON.stringify({
    text: 'Hello, this is a performance test message.',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(messageRes, { 'message accepted': (r) => r.status === 200 });
  sleep(1);
}
```

**方案 B： Artillery**

```yaml
# load-test.yml
config:
  target: 'http://localhost:3001'
  phases:
    - duration: 60
      arrivalRate: 5
scenarios:
  - flow:
      - post:
          url: '/api/v1/sessions'
          json:
            model: 'step-3.7-flash'
            mode: 'standard'
      - post:
          url: '/api/v1/sessions/{{ session.id }}/message'
          json:
            text: 'Performance test message'
```

#### 3.8.3 瓶颈定位

**可能的瓶颈点**：

1. **LLM API 延迟**
   - 症状：P95 延迟集中在 5-15s
   - 解决：增加缓存、减少上下文长度、使用更快模型

2. **SQLite 写入锁**
   - 症状：并发 > 10 时延迟激增
   - 解决：WAL 模式（已启用）、连接池、考虑 PostgreSQL

3. **Agent Loop CPU**
   - 症状：CPU > 80% 但等待 LLM 响应
   - 解决：优化工具执行、减少不必要的 LLM 调用

4. **内存泄漏**
   - 症状：长时间运行内存持续增长
   - 解决：定期 GC、检查 event listener 泄漏

#### 3.8.4 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. k6 / artillery 脚本编写 | 4h | 低 |
| 2. 基准测试执行（10/50/100 并发） | 4h | 低 |
| 3. 瓶颈分析与报告 | 4h | 低 |
| 4. 优化建议输出 | 2h | 低 |
| **总计** | **14h** | 低 |

**验收标准**：
- [ ] 10 并发下 P95 < 5s
- [ ] 50 并发下 P95 < 15s
- [ ] 100 并发下服务不崩溃
- [ ] 输出瓶颈分析报告

---

### 3.9 API 版本化与文档化

**触发条件**：若想对外开放或让其他服务调用，缺乏版本管理和清晰文档。

#### 3.9.1 路由版本化

**当前**：`/api/sessions`、`/api/approvals`

**V2**：`/api/v1/sessions`、`/api/v1/approvals`

**V3（未来）**：`/api/v2/sessions`（支持流式响应、批量操作）

```typescript
// Fastify 路由分组
server.register(v1Routes, { prefix: '/api/v1' });
server.register(v2Routes, { prefix: '/api/v2' });

// V1 路由（当前版本，保持不变）
const v1Routes = (server: FastifyInstance) => {
  server.post('/sessions', ...);
  server.post('/sessions/:id/message', ...);
  server.get('/sessions/:id/stream', ...);
};

// V2 路由（未来扩展）
const v2Routes = (server: FastifyInstance) => {
  server.post('/sessions', ...); // 增加 stream: true 参数
  server.post('/sessions/:id/message/batch', ...); // 批量消息
  server.get('/sessions/:id/metrics', ...); // 会话级指标
};
```

#### 3.9.2 OpenAPI (Swagger) 集成

```typescript
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

server.register(swagger, {
  openapi: {
    info: {
      title: 'Pi Agent API',
      description: 'Production-ready Agent API',
      version: '1.0.0',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Development' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
});

server.register(swaggerUi, { routePrefix: '/docs' });
```

#### 3.9.3 错误码标准化

```typescript
enum AgentErrorCode {
  // 4xx: 客户端错误
  INVALID_REQUEST = 'AGENT_001',
  MISSING_PARAMETER = 'AGENT_002',
  SESSION_NOT_FOUND = 'AGENT_003',
  APPROVAL_REQUIRED = 'AGENT_004',
  
  // 5xx: 服务端错误
  MODEL_TIMEOUT = 'AGENT_500',
  TOOL_EXECUTION_FAILED = 'AGENT_501',
  DATABASE_ERROR = 'AGENT_502',
  INTERNAL_ERROR = 'AGENT_503',
}

class AgentError extends Error {
  constructor(public code: AgentErrorCode, message: string, public statusCode: number = 500) {
    super(message);
  }
}

// 使用示例
throw new AgentError(AgentErrorCode.MODEL_TIMEOUT, 'Model API did not respond in time', 504);
```

#### 3.9.4 实施步骤

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 路由版本化重构 | 4h | 中（需兼容旧版本） |
| 2. Swagger 集成 | 2h | 低 |
| 3. 错误码标准化 | 2h | 低 |
| 4. API 文档完善 | 4h | 低 |
| **总计** | **12h** | 中 |

**验收标准**：
- [ ] `/api/v1/*` 路由正常工作
- [ ] `/docs` 提供可交互的 API 文档
- [ ] 所有错误响应包含标准错误码
- [ ] 旧版 `/api/*` 路由保持兼容（或明确迁移文档）

---

## 4. V2.5 产品体验增强（按需）

> 目标：在 V2 核心能力稳定后，提升产品竞争力和用户粘性。
> 预计总工期：4-6 周

### 4.1 会话轨迹可视化

**目标**：将 Agent 的每一步（思考、工具调用、结果）以时间线形式可视化展示。

**设计思路**：

```
┌─────────────────────────────────────────────────────┐
│  会话轨迹 (Session Trajectory)                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 1. 🤔 思考：用户想要创建 HTML 页面              │ │
│  │    ↓ 0.3s                                      │ │
│  │ 2. 🛠️ 工具调用：read_file("1.html")           │ │
│  │    ✓ 返回：11 行 HTML                          │ │
│  │    ↓ 0.2s                                      │ │
│  │ 3. 🛠️ 工具调用：write_file("1.html")          │ │
│  │    ✓ 返回：文件已更新                          │ │
│  │    ↓ 0.5s                                      │ │
│  │ 4. 💬 回复：已重新设计 1.html...               │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**技术实现**：
- 后端：已通过 requestId 追踪，只需将结构化日志暴露为 API
- 前端：复用现有日志数据，渲染为时间线组件
- 实时更新：通过 SSE 推送轨迹事件

```typescript
GET /api/sessions/:id/trajectory?requestId=xxx
```

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 后端 trajectory API | 4h | 低 |
| 2. 前端 Timeline 组件 | 4h | 中 |
| 3. SSE 实时推送 | 2h | 中 |
| **总计** | **10h** | 中 |

**验收标准**：
- [ ] 用户可查看任意会话的完整执行轨迹
- [ ] 时间线按时间顺序展示思考/工具/回复
- [ ] 点击轨迹节点可查看详细日志

---

### 4.2 技能封装（Skills）

**目标**：将常用工具组合封装成高层能力，降低用户使用门槛。

**设计思路**：

技能本质是"预定义的工具链 + 专门的系统提示"。

```typescript
// packages/agent-engine/src/skill.ts
export interface Skill {
  id: string;
  name: string;
  description: string;
  tools: string[];              // 引用的工具名称
  systemPrompt?: string;        // 技能专用提示
  parameters?: JSONSchema;      // 用户可配置的参数
  examples?: string[];          // 使用示例
}
```

**示例技能（参考 Pi-mato）**：

| 技能 | 描述 | 工具组合 |
|------|------|----------|
| html-ppt | 创建 HTML 演示文稿 | write_file + read_file + bash（打开浏览器） |
| character-creator | 引导创建助手角色 | write_file + zip（打包角色卡） |
| edge-tts | 语音合成 | bash（调用 edge-tts 命令） |
| quiet-musing | 复杂问题推理 | read_file + web_search + write_file（生成分析报告） |

**实现方案**：
- 在 MODEL_CONFIGS 同级添加技能注册表
- 用户选择技能后，Agent 自动加载对应的工具集合和系统提示
- 前端展示技能列表（参考 Pi-mato 的"项目技能"侧边栏）

**技能导出与共享（为 5.3 Skill 市场铺垫）**：

即使 5.3 自定义 Skill 市场尚未启动，内部技能也应支持通过文件或 Git 共享，为未来的开放生态铺垫基础。

1. **技能包格式**（基于 JSON/YAML）
```yaml
# skill-package.yaml
name: html-ppt
version: 1.0.0
description: 创建 HTML 演示文稿
author: internal-team

tools:
  - write_file
  - read_file
  - bash

systemPrompt: |
  你是一个专业的 HTML 演示文稿生成助手...

parameters:
  - name: theme
    type: string
    default: "default"
  - name: slides
    type: number
    default: 10

examples:
  - "创建一个 5 页的产品介绍 PPT"
  - "将这份 Markdown 转换为 HTML 幻灯片"
```

2. **导出功能**
```typescript
POST /api/skills/:id/export
Response: application/zip 或 application/yaml
```

3. **导入功能**
```typescript
POST /api/skills/import
Body: multipart/form-data (skill-package.yaml)
```

4. **版本管理**
   - 技能包支持 semantic versioning
   - 导入时检测版本冲突
   - 支持回滚到历史版本

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. Skill 接口设计 | 2h | 低 |
| 2. 技能注册表实现 | 4h | 低 |
| 3. 前端技能选择器 | 4h | 低 |
| **总计** | **10h** | 低 |

**验收标准**：
- [ ] 用户可在对话前选择技能
- [ ] 选择技能后，Agent 自动加载对应工具和提示
- [ ] 技能执行结果可复现

---

### 4.3 任务计划（Scheduler）

**目标**：支持用户创建定时任务，让 Agent 按预设规则自动执行操作。

**典型场景**：
- 每 10 分钟生成一个 hello-world.html（Pi-mato 实际用例）
- 每天 9:00 生成日报摘要
- 每周一检查代码仓库更新

**设计方案**：

**数据模型**：
```sql
-- 新增 scheduled_tasks 表
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,
  sessionId TEXT,              -- 关联会话，用于上下文
  name TEXT NOT NULL,
  cronExpr TEXT NOT NULL,       -- 如 "*/10 * * * *"
  prompt TEXT NOT NULL,         -- 要执行的任务描述
  enabled BOOLEAN DEFAULT TRUE,
  is_running BOOLEAN DEFAULT FALSE, -- 并发控制锁
  lastRunAt TEXT,
  nextRunAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**调度引擎**：

使用 `node-cron` 或 `@vercel/cron` 作为底层调度器：

```typescript
// packages/scheduler/src/scheduler.ts
import cron from 'node-cron';

export class TaskScheduler {
  private jobs = new Map<string, cron.ScheduledTask>();

  constructor(private agentEngine: AgentEngine) {}

  async scheduleTask(task: ScheduledTask) {
    // 1. 取消已有任务（如果存在）
    this.unscheduleTask(task.id);
    
    // 2. 创建新任务
    const job = cron.schedule(task.cronExpr, async () => {
      this.logger.info({ taskId: task.id, taskName: task.name }, 'Executing scheduled task');
      
      // 3. 在指定 workspace 中执行
      await this.agentEngine.prompt(
        task.sessionId || `scheduler-${task.id}`,
        task.prompt,
        { workspaceContext: { workspaceId: task.workspaceId } }
      );
      
      // 4. 更新执行记录
      await this.updateLastRun(task.id);
    });
    
    this.jobs.set(task.id, job);
  }

  unscheduleTask(taskId: string) {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      this.jobs.delete(taskId);
    }
  }
}
```

**前端交互**：
- 任务列表（CRUD）
- Cron 表达式可视化编辑（可选）
- 手动触发 / 暂停 / 删除
- 执行历史查看

**并发控制**：

**问题**：如果任务执行时间超过调度间隔（如"每 10 分钟"的任务执行了 15 分钟），会导致多个 Agent 实例同时运行，造成资源竞争、文件冲突或数据库死锁。

**方案 A（推荐）：应用层锁**

在任务记录中增加 `is_running` 字段，执行前检查该字段：

```sql
ALTER TABLE scheduled_tasks ADD COLUMN is_running BOOLEAN DEFAULT FALSE;
```

```typescript
async function executeTask(task: ScheduledTask) {
  // 1. 尝试获取锁（原子操作）
  const acquired = await db.transaction(() => {
    const task = db.prepare('SELECT is_running FROM scheduled_tasks WHERE id = ?').get(task.id);
    if (task.is_running) return false;
    db.prepare('UPDATE scheduled_tasks SET is_running = TRUE WHERE id = ?').run(task.id);
    return true;
  });
  
  if (!acquired) {
    this.logger.warn({ taskId: task.id }, 'Task skipped: previous execution still running');
    return; // 跳过本次调度
  }
  
  try {
    // 2. 执行任务
    await this.agentEngine.prompt(...);
  } finally {
    // 3. 释放锁
    db.prepare('UPDATE scheduled_tasks SET is_running = FALSE WHERE id = ?').run(task.id);
  }
}
```

**方案 B：Redis 分布式锁**（如果使用 PostgreSQL + Redis）

```typescript
import Redlock from 'redlock';

const redlock = new Redlock([redisClient]);

async function executeTask(task: ScheduledTask) {
  const lock = await redlock.acquire([`task:${task.id}`], 60000); // 60s 超时
  try {
    await this.agentEngine.prompt(...);
  } finally {
    await lock.release();
  }
}
```

**方案对比**：

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| 应用层锁 | 简单，无外部依赖 | 仅适用于单实例 | SQLite + 单实例 |
| Redis 分布式锁 | 支持多实例 | 需引入 Redis | PostgreSQL + 多实例 |

**验收标准补充**：
- [ ] 当任务执行超时时，系统跳过本次调度而非崩溃
- [ ] 任务执行记录中包含"跳过"状态
- [ ] 不会出现同一任务的并行执行

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. scheduled_tasks 表设计 | 2h | 低 |
| 2. TaskScheduler 实现 | 6h | 中 |
| 3. 前端任务管理界面 | 6h | 低 |
| 4. 执行历史 API | 2h | 低 |
| **总计** | **16h** | 中 |

**验收标准**：
- [ ] 用户可创建/编辑/删除定时任务
- [ ] Cron 表达式正确触发任务
- [ ] 任务执行结果持久化到会话历史
- [ ] 前端可查看任务执行历史

---

### 4.4 Agent 记忆分层

**现状**：当前会话是"用完即忘"的，每次新会话从零开始。

**愿景**：让 Agent 记住用户偏好、项目上下文、历史决策，在跨会话中保持一致性。

**设计思路**：

```
┌─────────────────────────────────────────────────────────┐
│  Agent 记忆分层                                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │  核心记忆 (Core Memory) — 永不遗忘             │   │
│  │  用户偏好、项目结构、关键决策                   │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  日级记忆 (Working Memory) — 本轮会话内        │   │
│  │  当前对话历史、工具调用结果                     │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  长期记忆 (Archival Memory) — 按需检索        │   │
│  │  历史会话摘要、知识库、向量索引                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**实现方案**：

#### 4.4.1 核心记忆

存储在 `user_preferences` 表中，每次会话自动加载到系统提示：

```sql
CREATE TABLE user_preferences (
  userId TEXT PRIMARY KEY,
  preferences JSONB NOT NULL,
  updatedAt TEXT NOT NULL
);
```

#### 4.4.2 日级记忆

当前已有（`messages` 表）。

#### 4.4.3 长期记忆

使用 `sqlite-vec` 或迁移到 PostgreSQL + `pgvector`，支持语义检索：

```typescript
// 存储会话摘要
interface MemoryChunk {
  id: string;
  sessionId: string;
  userId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

// 语义检索
async function searchMemories(query: string, limit = 5): Promise<MemoryChunk[]> {
  const embedding = await generateEmbedding(query);
  return db.query(`
    SELECT * FROM memories
    ORDER BY embedding <=> ?
    LIMIT ?
  `, [embedding, limit]);
}
```

**遗忘机制**：

**问题**：文档聚焦于如何"记住"，但未提及如何"遗忘"。这不仅是用户体验问题，也是 GDPR 等法规的合规要求（被遗忘权）。

**设计方案**：

1. **用户主动遗忘**
   - 用户可在设置中删除自己的核心记忆或长期记忆
   - 前端提供"清除记忆"按钮，确认后立即删除

```typescript
DELETE /api/memories/:memoryId
```

2. **自动过期**
   - 记忆条目设置 TTL（Time To Live）
   - 核心记忆：永不过期（用户可手动删除）
   - 长期记忆：默认 30 天过期，可配置
   - 日级记忆：随 session 过期自动清理

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL, -- 'core' | 'working' | 'archival'
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  expiresAt TEXT, -- 过期时间，NULL 表示永不过期
  createdAt TEXT NOT NULL
);

-- 自动清理过期记忆
CREATE INDEX idx_memories_expires ON memories(expiresAt);
```

3. **遗忘策略**
   - 优先级遗忘：低相关性记忆先过期
   - 容量限制：长期记忆最多保留 1000 条，超过时删除最久未访问的
   - 用户控制：用户可标记某些记忆为"重要"，防止自动遗忘

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 记忆过期字段 + 清理脚本 | 2h | 低 |
| 2. 用户主动删除 API | 2h | 低 |
| 3. 前端"清除记忆"界面 | 2h | 低 |
| 4. 遗忘策略实现（TTL/容量限制） | 4h | 低 |
| **追加工时** | **10h** | 低 |

**验收标准**：
- [ ] 用户可主动删除自己的记忆
- [ ] 过期记忆自动清理（每日定时任务）
- [ ] 系统支持 GDPR 数据导出/删除请求
- [ ] 记忆过期策略可配置

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. user_preferences 表 + API | 4h | 低 |
| 2. 会话摘要生成（LLM 摘要） | 4h | 中 |
| 3. 向量检索实现 | 6h | 中 |
| 4. 前端记忆展示 | 4h | 低 |
| **总计** | **18h** | 中 |

**验收标准**：
- [ ] 用户偏好跨会话保持一致
- [ ] 新会话能检索到相关历史记忆
- [ ] 记忆检索结果按相关性排序

---

### 4.5 实验性功能门控（Feature Flags）

**现状**：新功能上线 = 全量用户可见，风险高。

**愿景**：支持灰度发布和 A/B 测试，降低新功能上线风险。

```typescript
interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100
  targetUsers?: string[];     // 白名单
  targetTenants?: string[];   // 租户维度
}

// 使用示例
if (featureFlags.isEnabled('new_model_router', { userId, tenantId })) {
  // 使用新路由逻辑
} else {
  // 使用旧逻辑
}
```

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. FeatureFlag 表设计 | 2h | 低 |
| 2. 服务端门控中间件 | 4h | 低 |
| 3. 前端门控 Hook | 2h | 低 |
| 4. 管理界面（可选） | 4h | 低 |
| **总计** | **12h** | 低 |

**验收标准**：
- [ ] 可针对用户/租户开启/关闭功能
- [ ] 支持百分比灰度发布
- [ ] 新功能对未授权用户完全不可见

---

## 5. V3 探索性功能

> 目标：在 V2 数据飞轮运转后，基于真实数据探索下一代 Agent 能力。

### 5.1 Agent 自我进化

**前提条件**：V2 数据飞轮已收集足够的反馈数据（> 10k 条），且 V2.5 Feature Flags 已就绪。

**技术路径**：

1. **反馈数据积累**
   - 收集用户点赞/点踩数据（见 3.1）
   - 记录工具调用成功/失败、耗时、重试次数

2. **Prompt 自动优化**
   - 使用 LLM-as-judge 评估当前 Prompt 效果
   - A/B 测试不同 Prompt 版本，选择 CTR/CVR 更高的版本
   - 存储最优 Prompt 到数据库，支持热更新

3. **工具选择优化**
   - 构建工具调用成功率的特征工程
   - 使用轻量级模型（如 `deepseek-chat`）做路由决策
   - 离线训练 → 在线推理

**安全护栏设计**：

**问题**：V3 计划用 LLM 自动优化 Prompt 和路由策略，但自动决策可能产生"不可预期"或"不可逆"的后果。

**设计方案**：

1. **A/B 测试框架（与 4.5 Feature Flags 联动）**
   - 所有自动优化都应先在小范围（如 1% 用户）试验
   - 试验期间，对照组使用旧策略，实验组使用新策略
   - 自动收集两组的反馈数据，进行统计显著性检验

```typescript
interface Experiment {
  id: string;
  name: string;
  controlPrompt: string;
  treatmentPrompt: string;
  rolloutPercentage: number; // 1-100
  metrics: ['user_satisfaction', 'task_success_rate', 'latency'];
  minSampleSize: number; // 最小样本量
  significanceLevel: number; // 0.05
}
```

2. **自动回滚机制**
   - 系统实时监控关键指标（用户满意度、任务成功率）
   - 如果实验组指标恶化超过阈值（如满意度下降 > 5%），自动回滚到旧策略
   - 回滚后发送告警通知运维团队

```typescript
class ExperimentMonitor {
  async checkExperimentHealth(experimentId: string): Promise<boolean> {
    const control = await this.getMetrics(experimentId, 'control');
    const treatment = await this.getMetrics(experimentId, 'treatment');
    
    // 如果实验组满意度下降超过 5%，触发回滚
    if (treatment.userSatisfaction < control.userSatisfaction * 0.95) {
      await this.rollback(experimentId);
      return false;
    }
    
    return true;
  }
}
```

3. **人工审核通道**
   - 所有自动优化必须经过人工审核才能全量发布
   - 保留一键回滚到任意历史版本的能力
   - 优化日志完整记录：时间、修改内容、指标变化、审批人

4. **灰度发布策略**
   - 第一阶段：1% 用户，观察 24 小时
   - 第二阶段：10% 用户，观察 72 小时
   - 第三阶段：50% 用户，观察 1 周
   - 第四阶段：100% 全量

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. A/B 测试框架（基于 4.5 Feature Flags） | 4h | 低 |
| 2. 自动回滚逻辑 | 4h | 中 |
| 3. 实验 Dashboard | 4h | 低 |
| **追加工时** | **12h** | 中 |

**验收标准**：
- [ ] 新 Prompt 先经过 1% 用户试验
- [ ] 指标恶化时自动回滚
- [ ] 人工审核流程可中断任何自动优化
- [ ] 实验数据完整可追溯

**风险评估**：
- 中等风险：自动优化可能产生不可预期的行为
- 缓解：保留人工审核通道，支持一键回滚 Prompt

---

### 5.2 多 Agent 协作

**愿景**：将复杂任务拆解给多个子 Agent 并行处理。

**技术路径**：

1. **Agent 注册中心**
   ```typescript
   interface AgentWorker {
     id: string;
     capabilities: string[]; // ['code', 'research', 'writing']
     maxConcurrency: number;
   }
   ```

2. **任务分发器**
   ```typescript
   class OrchestratorAgent extends Agent {
     async decompose(task: string): Promise<SubTask[]> {
       // 使用 LLM 将任务拆解为子任务
     }
     
     async dispatch(subTasks: SubTask[]): Promise<Result[]> {
       // 并行分发给 Worker Agent
     }
     
     async synthesize(results: Result[]): Promise<string> {
       // 合并子任务结果
     }
   }
   ```

3. **通信协议**
   - 复用现有 SSE 协议
   - 增加 `agent_handoff` 事件类型
   - 子 Agent 结果通过 `tool_result` 返回

**风险评估**：
- 高风险：复杂度爆炸，调试困难
- 缓解：先从"串行委派"开始，逐步迭代到并行

---

### 5.3 自定义 Skill 市场

**愿景**：允许用户上传自己的工具/Skill，扩展 Agent 能力。

**技术路径**：

1. **Skill 沙箱**
   - 使用 `vm2` 或 `isolated-vm` 运行用户代码
   - 限制文件系统、网络访问
   - 超时控制（如 30s）

2. **Skill 注册表**
   ```typescript
   interface SkillManifest {
     id: string;
     name: string;
     version: string;
     description: string;
     tools: AgentTool<any>[];
     systemPrompt?: string;
   }
   ```

3. **Marketplace UI**
   - 前端展示 Skill 列表
   - 一键安装到当前 workspace
   - 评分和评论系统

**风险评估**：
- 高风险：安全风险（恶意 Skill）、稳定性风险（Skill 崩溃）
- 缓解：代码审计 + 沙箱 + 社区举报机制

---

### 5.4 对话导出与分享

**现状**：对话只能在自己界面看到。

**愿景**：支持导出为 Markdown、HTML、PDF，或生成可分享的链接。

**实现方案**：

```typescript
// 导出接口
GET /api/sessions/:id/export?format=md|html|pdf

// 生成匿名分享链接（敏感内容脱敏）
POST /api/sessions/:id/share
```

**实施步骤**：

| 步骤 | 工作量 | 风险 |
|------|--------|------|
| 1. 导出格式实现（md/html/pdf） | 4h | 低 |
| 2. 匿名分享链接（脱敏） | 4h | 中 |
| 3. 前端导出/分享按钮 | 2h | 低 |
| **总计** | **10h** | 中 |

**验收标准**：
- [ ] 支持 Markdown / HTML / PDF 三种格式导出
- [ ] 分享链接可被未登录用户访问
- [ ] 敏感内容（如 API Key）自动脱敏

---

## 6. V4 场景化工作台

> 目标：将 V3 积累的能力（多 Agent 协作、工具路由、记忆分层）包装成面向具体角色的产品形态。
> 当前状态：✅ 已完成（2026-08-25）
> 设计原则：能力导向 → 场景导向

### 6.1 设计理念

V3 是"能力导向"——我们有记忆、进化、多 Agent、工具路由，但用户需要自己组合这些能力。V4 是"场景导向"——把能力包装成用户能直接解决具体问题的产品。

| 角色 | 工作台 | 核心场景 | 复用 V3 能力 |
|------|--------|----------|--------------|
| 开发者 | Dev Workbench | PR 审查、测试生成、调试、代码重构 | 多 Agent 模板、工具路由、记忆 |
| 产品经理 | Product Hub | 需求分析、PRD 生成、任务拆解、竞品调研 | 多 Agent 模板、调研→写作、记忆 |
| 运营/分析师 | Analytics Desk | 数据提取、趋势分析、报告生成 | 数据报告模板、工具路由、记忆 |

### 6.2 已落地能力

| 能力 | 状态 | 说明 |
|------|------|------|
| 三个角色工作台页面 | ✅ | `/dev-workbench`、`/product-workbench`、`/analyst-workbench` |
| 预设任务卡片 | ✅ | 每个角色 4 个预设任务，点击触发对应多 Agent 模板 |
| 通用 Workbench 抽象 | ✅ | WorkbenchLayout + WorkbenchTaskCard + WorkbenchStatus 可复用组件 |
| 模板联动 | ✅ | 点击任务自动加载对应多 Agent 模板，支持 URL 参数传递 |
| 执行态反馈 | ✅ | 任务运行中展示实时状态（等待中/运行中/已完成/失败） |
| 结果回传 | ✅ | 任务完成后展示结果摘要，支持轮询状态 |

### 6.3 技术实现

```typescript
// 通用 Workbench 配置
interface WorkbenchConfig {
  name: string;           // "开发者工作台"
  route: string;          // "/dev-workbench"
  tasks: WorkbenchTask[];
  colorTheme: string;
  returnPath: string;
}

// 预设任务定义
interface WorkbenchTask {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType;
  time: string;           // "2-5 分钟"
  templateId: string;     // 多 Agent 模板 ID
  color: 'blue' | 'purple' | 'cyan' | 'green' | 'orange';
}
```

---

## 7. V4.1 LLM 能力增强

> 目标：增强系统的模型管理能力，支持更多供应商、更智能的模型选择。
> 当前状态：✅ 已完成（2026-08-25）

### 7.1 已落地能力

| 阶段 | 能力 | 状态 | 说明 |
|------|------|------|------|
| V4.1a | 模型能力标签 | ✅ | 前端展示 Context/Reasoning/Vision 能力标签 |
| V4.1b | 接入新供应商 | ✅ | Anthropic Claude（3 个模型）+ Google Gemini（2 个模型） |
| V4.1c | 自动模型选择 | ✅ | 基于任务复杂度 + 成本 + 成功率自动路由 |
| V4.1d | 用户自定义模型配置 | ✅ | 用户添加自定义模型（endpoint、API key、参数） |

### 7.2 模型能力标签

**展示效果**：

```text
GPT-4o                   ✓
128K · Reasoning · Vision

Claude 3.5 Sonnet
200K · Reasoning · Vision

Gemini 2.0 Flash
1M · Reasoning · Vision
```

**数据模型**：

```typescript
interface Model {
  id: string;
  name: string;
  contextLength: number;      // 上下文窗口大小
  supportsReasoning: boolean; // 是否支持推理链
  supportsVision: boolean;    // 是否支持视觉
  provider: string;           // deepseek/openai/anthropic/google
  inputCost?: number;         // 每百万输入 token 成本
  outputCost?: number;        // 每百万输出 token 成本
}
```

### 7.3 自动模型选择（ModelSelector）

**设计思路**：

```text
用户消息 + 上下文
    ↓
任务复杂度评估（消息长度、工具数量、历史轮次）
    ↓
硬过滤：能力匹配（Vision / Reasoning / Context Length）
    ↓
软排序：按策略打分
  - 能力匹配分（+10）
  - 历史成功率分（0~10）
  - 成本分（0~5）
  - 用户偏好分（+5）
  - 上下文适配分（0~3）
    ↓
应用路由策略（均衡/性能/成本/推理优先）
    ↓
返回最优模型
```

**路由策略**：

| 策略 | 说明 |
|------|------|
| 均衡 | 综合性能、成本、推理能力 |
| 性能优先 | 历史成功率最高的模型 |
| 成本优先 | 成本最低的模型 |
| 推理优先 | 支持 Reasoning 的模型优先 |

**前端配置**：

- 在 AgentEvolutionPage 新增"模型路由"Tab
- 配置项：路由策略、优先模型、回退模型、自动降级开关

### 7.4 当前模型供应商覆盖

| 供应商 | 模型 | 能力标签 |
|--------|------|----------|
| DeepSeek | deepseek-chat, deepseek-reasoner | Context / Reasoning |
| OpenAI | gpt-4o, gpt-4o-mini, o1-preview, o1-mini | Context / Reasoning / Vision |
| Anthropic | claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus | Context / Reasoning / Vision |
| StepFun | step-3.7-flash, step-2-16k | Context / Reasoning |
| Google | gemini-2.0-flash, gemini-2.0-pro | Context / Reasoning / Vision |
| Ollama | llama3.1, llama3.2 | Context / Reasoning / Vision |

---

## 8. V5 Agent Market

> 目标：允许用户上传、分享、使用自定义 Skills，形成 Agent 生态。
> 当前状态：✅ 已完成（2026-08-25）
> 对应原文档：5.3 自定义 Skill 市场

### 8.1 已落地能力

| 模块 | 状态 | 说明 |
|------|------|------|
| Skill 上传 | ✅ | 表单 + manifest + prompt + tools + code |
| Skill 列表 | ✅ | 市场首页 + 搜索 + 分类筛选 |
| Skill 详情 | ✅ | 展示 manifest、使用说明、评分、评论 |
| Skill 启停 | ✅ | 启用/禁用开关，实时生效 |
| Agent 集成 | ✅ | 创建后立即注册到 Agent，无需重启 |
| 评分 + 排行榜 | ✅ | 热门 / 评分最高 / 最新 |
| 分类浏览 | ✅ | 分类标签页 + 后端过滤器 |
| 版本管理 | ✅ | 发布新版本、回滚、变更日志 |
| 工作台集成 | ✅ | 市场技能出现在角色工作台中 |
| 使用统计 | ✅ | 调用次数、成功率、趋势图 |
| 评论系统 | ✅ | 匿名评论 + 星级 + 删除 |
| Skill 沙箱 | ✅ | worker_threads + vm 隔离执行 |

### 8.2 数据模型

```sql
-- 技能主表
CREATE TABLE market_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0.0',
  manifest JSONB NOT NULL,      -- { tools, systemPrompt, parameters, code }
  author TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  downloads INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  ratingCount INTEGER DEFAULT 0,
  category TEXT,
  currentVersion TEXT DEFAULT '1.0.0',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 版本历史
CREATE TABLE skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest JSONB NOT NULL,
  changelog TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  FOREIGN KEY (skill_id) REFERENCES market_skills(id) ON DELETE CASCADE
);

-- 使用记录
CREATE TABLE skill_usage (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  success BOOLEAN DEFAULT TRUE,
  durationMs INTEGER,
  FOREIGN KEY (skill_id) REFERENCES market_skills(id)
);

-- 评论
CREATE TABLE skill_comments (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_name TEXT,
  content TEXT NOT NULL,
  rating INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES market_skills(id) ON DELETE CASCADE
);
```

### 8.3 Skill 沙箱实现

**技术选型**：worker_threads + vm（备选，原因见下）

**选型说明**：isolated-vm 在 Windows + Node 25 环境下无法编译（缺 VS Build Tools + 无官方 prebuilt），回退到 worker_threads + vm 方案。接口完全兼容，未来可零成本替换。

**沙箱边界**：

| 维度 | 限制 |
|------|------|
| 执行超时 | 30 秒强制中断（worker.terminate()） |
| 内存上限 | 64 MB（resourceLimits） |
| 文件系统 | 仅限沙箱目录 `/tmp/skill-sandbox/<skillId>/` |
| 路径穿越 | path.resolve + 分隔符边界校验 |
| 系统调用 | process、require 被拦截 |
| 并发 | 每个 Skill 独立线程，互不干扰 |

**验证结果**：

| 场景 | 结果 |
|------|------|
| 正常执行 | ✅ 39ms 返回结果 |
| process/require 访问 | ✅ undefined（无泄漏） |
| 路径穿越攻击 | ✅ BLOCKED: path traversal detected |
| 死循环 | ✅ 30s 硬超时 |
| 内存限制 | ✅ 64MB |

**待强化方向**：

- 生产环境建议切回 isolated-vm（需安装 VS Build Tools 或换 LTS Node）
- 可增加网络白名单与磁盘配额

### 8.4 API 设计

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/skills | 技能列表（支持分类/排序过滤） |
| GET | /api/skills/:id | 技能详情 |
| POST | /api/skills | 创建技能（含 code） |
| PUT | /api/skills/:id | 更新技能 |
| DELETE | /api/skills/:id | 删除技能 |
| PATCH | /api/skills/:id/toggle | 启用/禁用 |
| GET | /api/skills/categories | 分类列表 |
| GET | /api/skills/:id/versions | 版本历史 |
| POST | /api/skills/:id/versions | 发布新版本 |
| POST | /api/skills/:id/rollback/:versionId | 回滚 |
| POST | /api/skills/:id/rate | 评分 |
| POST | /api/skills/:id/install | 安装计数 |
| GET | /api/skills/:id/comments | 评论列表 |
| POST | /api/skills/:id/comments | 创建评论 |
| DELETE | /api/skills/:id/comments/:commentId | 删除评论 |
| POST | /api/skills/:id/execute-tool | 沙箱执行技能工具 |
| GET | /api/skills/:id/stats | 使用统计 |
| GET | /api/skills/stats/top | 热门技能排行 |

---

## 9. 完整演进路径总览

```text
V2.0 → V2.5（基础设施 + 核心能力）
    ↓
V3.0（自我进化 + 多 Agent 协作）
    ↓
V4.0（场景化工作台） + V4.1（LLM 能力增强）
    ↓
V5.0（Agent Market + 沙箱）
    ↓
V6.0（待规划）
```

---

## 10. 文档更新记录

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v3.1 | 2026-08-24 | 原始版本（V2/V3 规划） |
| v4.0 | 2026-08-25 | 新增 V4 场景化工作台章节 |
| v4.1 | 2026-08-25 | 新增 V4.1 LLM 能力增强章节 |
| v5.0 | 2026-08-25 | 新增 V5 Agent Market 章节（含沙箱） |

---

## 11. 里程碑与验收标准

### Milestone 1：生产就绪（已完成）

- [x] 功能完整性 100%
- [x] 稳定性加固（超时 / 限流 / crash 捕获）
- [x] 全链路追踪（requestId）
- [x] 进程守护（PM2）
- [x] E2E 错误路径测试

### Milestone 2：V2 基础设施（2-3 周）

**验收标准**：
- [ ] 2.1 vendor/pi Patch 管理：patch-package 正常工作
- [ ] 2.2 健康检查分级：三级健康检查通过 K8s 探针验证
- [ ] 2.3 数据库备份：自动备份 + 恢复演练通过
- [ ] 2.4 数据库选型评估：明确 SQLite vs PostgreSQL 决策，若迁移则完成

### Milestone 3：V2 核心能力（6-8 周）

**验收标准**：
- [ ] 3.1 数据飞轮：feedback 表 + 数据看板上线，日均反馈 > 100 条；冷启动策略验证通过
- [ ] 3.2 模型路由：自动路由准确率 > 90%
- [ ] 3.3 成本控制：预算告警准确，无超支案例；usage_records 数据完整
- [ ] 3.4 安全纵深防御：渗透测试通过，无路径穿越/命令注入漏洞
- [ ] 3.5 可观测性：Sentry + Prometheus + 看板全部上线；模型行为审计记录完整
- [ ] 3.6 agent loop 状态机：Spike 完成，审批恢复成功率 > 99%
- [ ] 3.7 多租户：基于 2.4 决策实施，数据隔离通过，租户间无法访问彼此数据
- [ ] 3.8 性能基准：50 并发 P95 < 15s
- [ ] 3.9 API 版本化：`/api/v1/*` 稳定，Swagger 文档完整

### Milestone 4：V2.5 产品体验增强（4-6 周）

**验收标准**：
- [ ] 4.1 会话轨迹可视化：时间线渲染流畅，支持 1000+ 事件
- [ ] 4.2 技能封装：至少 3 个内置技能可用；支持导出/导入技能包
- [ ] 4.3 任务计划：Cron 任务执行成功率 > 95%；并发冲突时优雅跳过
- [ ] 4.4 Agent 记忆分层：跨会话记忆检索准确率 > 80%；支持用户主动遗忘和自动过期
- [ ] 4.5 Feature Flags：灰度发布功能可用，支持百分比 rollout

### Milestone 5：V3 探索性功能（6-12 个月）

**验收标准**：
- [ ] 5.1 Agent 自我进化：Prompt 优化通过 A/B 测试验证，满意度提升 > 10%；自动回滚机制有效
- [ ] 5.2 多 Agent 协作：子任务并行执行，总耗时减少 > 30%
- [ ] 5.3 自定义 Skill 市场：至少 10 个社区 Skill；沙箱安全审计通过
- [ ] 5.4 对话导出：导出功能使用率 > 20%；敏感内容脱敏准确率 100%

---

## 12. 决策树：何时启动下一阶段

```
当前系统运行稳定？
├── 否 → 继续加固稳定性（P2 任务）
└── 是 → 基础设施是否就绪？
    ├── 否 → 启动 V2 基础设施（Patch管理 + 健康检查 + 备份 + 数据库选型评估）
    │   └── 数据库选型评估结论？
    │       ├── 需要 PostgreSQL → 优先完成迁移，再启动 3.x
    │       └── 继续 SQLite → 进入下一决策
    └── 是 → 是否需要数据驱动决策？
        ├── 是 → 启动 3.1 数据飞轮（反馈闭环 + 成本控制 + 安全）
        │   └── 数据飞轮冷启动策略？
        │       ├── 用户量 < 100 → 合成数据 + 内部测试团队
        │       └── 用户量 > 100 → 直接收集真实反馈
        ├── 否 → 技术预研是否完成？
        │   ├── 否 → 可先进行 3.6 Spike（4h），验证状态机可行性
        │   └── 是 → 是否需要多团队使用？
        └── 否 → 是否需要多团队使用？
            ├── 是 → 启动 3.7 多租户支持
            │   └── 数据库已选型？
            │       ├── PostgreSQL → 直接实施多租户
            │       └── SQLite → 评估是否需升级
            └── 否 → 是否出现线上异常且无法快速定位？
                ├── 是 → 启动 3.5 可观测性
                └── 否 → 继续积累数据，等待明确信号
```

**决策要点**：
1. **数据库选型（2.4）**：如果决定迁移到 PostgreSQL，需提前到 V2 基础设施阶段完成，影响后续所有模块
2. **状态机改造（3.6）**：不需要等数据飞轮数据，技术预研（Spike）完成即可启动
3. **数据飞轮（3.1）**：冷启动阶段可使用合成数据，无需等待真实用户反馈
4. **多租户（3.7）**：依赖 2.4 数据库决策，SQLite 方案仅适用于单实例场景

---

## 13. 技术依赖与风险评估

### 13.1 模块依赖关系

```
2.1 Patch管理 ─┐
2.2 健康检查 ──┤
2.3 数据库备份 ┘
2.4 数据库选型评估 ──→ 影响 3.1/3.3/3.7 的表设计
        ↓
3.1 数据飞轮 ──→ 3.2 模型路由 ──→ 3.3 成本控制
        ↓               ↓               ↓
3.4 安全纵深防御 ←── 3.5 可观测性 ←── 3.6 状态机改造
        ↓                              ↑
3.7 多租户支持 ──→ 3.8 性能压测 ──→ 3.9 API版本化
   （依赖 2.4 决策）
        ↓
4.x V2.5 产品体验
        ↓
5.x V3 探索性功能
```

**说明**：
- 3.6 状态机改造：依赖 3.1 数据决策 **或** 技术预研（Spike）完成
- 3.7 多租户支持：依赖 2.4 数据库选型决策（SQLite vs PostgreSQL）
- 2.4 数据库选型：如果决定迁移到 PostgreSQL，需提前到 V2 基础设施阶段完成

### 13.2 风险评估矩阵

| 模块 | 依赖 | 风险 | 缓解措施 |
|------|------|------|----------|
| 2.1 Patch管理 | 独立 | 低 | 已有 patch 可验证 |
| 2.2 健康检查 | 独立 | 低 | 标准 HTTP 端点 |
| 2.3 数据库备份 | 独立 | 低 | 验证脚本确保可恢复 |
| 2.4 数据库选型评估 | 3.7 多租户 | 中 | 压测验证 + POC |
| 3.1 数据飞轮 | 2.1-2.4 | 低 | 合成数据冷启动 + E2E 测试 |
| 3.2 模型路由 | 3.1 | 低 | 无外部依赖，纯逻辑 |
| 3.3 成本控制 | 3.1 | 中 | 预算超限保护 + 人工审批 |
| 3.4 安全纵深防御 | 独立 | 中 | 渗透测试 + 代码审计 |
| 3.5 可观测性 | 独立 | 低 | 开源方案，成熟稳定 |
| 3.5.4 模型行为审计 | 3.5 | 低 | 异步记录，不影响主流程 |
| 3.6 状态机改造 | 3.1 数据决策 **或** Spike | 中 | 保留 workaround fallback |
| 3.7 多租户 | 2.4 + 3.4 安全 | 中 | 先评估再实施 |
| 3.8 性能压测 | 独立 | 低 | 自动化脚本 |
| 3.9 API 版本化 | 独立 | 中 | 兼容旧版本 |
| 4.1 会话轨迹可视化 | 3.5 | 中 | SSE 实时推送 |
| 4.2 技能封装 | 独立 | 低 | 预留导出能力 |
| 4.3 任务计划 | 独立 | 中 | 并发控制（应用层锁/Redis） |
| 4.4 Agent 记忆分层 | 2.4（PostgreSQL） | 中 | 隐私合规 + 遗忘机制 |
| 4.5 Feature Flags | 独立 | 低 | 简单 key-value 查询 |
| 5.1 Agent 自我进化 | 3.1 + 4.5 | 高 | A/B 测试 + 自动回滚 |
| 5.2 多 Agent 协作 | 独立 | 高 | 小范围试点 |
| 5.3 自定义 Skill 市场 | 4.2 | 高 | 沙箱 + 代码审计 |
| 5.4 对话导出与分享 | 独立 | 中 | 敏感内容脱敏 |

---

## 14. 附录

### 14.1 关键文件索引

| 文件 | 说明 |
|------|------|
| `docs/production-readiness-checklist.md` | 生产就绪 checklist |
| `docs/roadmap-v2-v3.md` | 本文档 |
| `scripts/e2e-error-paths.mjs` | E2E 错误路径测试 |
| `apps/server/rotate-logs.ps1` | 日志轮转脚本 |
| `packages/agent-engine/src/engine.ts` | AgentEngine 核心 |

### 14.2 术语表

| 术语 | 说明 |
|------|------|
| requestId | 单次 HTTP 请求的唯一标识，贯穿全链路日志 |
| sessionId | 会话级标识，同一个用户的长期对话 |
| agent loop | vendor/pi 的核心循环，负责 LLM 调用和工具执行 |
| workspace | 工作区，对应一个项目/目录 |
| tenant | 租户，多租户架构中的团队/组织隔离单元 |
| data flywheel | 数据飞轮：用户反馈 → Agent 优化 → 更好的用户体验 → 更多反馈 |
| feature flag | 实验性功能门控，支持灰度发布和 A/B 测试 |
| model router | 模型路由器，根据任务复杂度自动选择模型 |
| core memory | Agent 核心记忆，存储用户偏好和关键决策 |
| archival memory | Agent 长期记忆，存储历史会话摘要和知识库 |

### 14.3 参考项目

- **Pi-mato**：基于 Pi-Agent + DSH 的项目，提供了模型路由、Scheduler、Skills 等产品能力参考
- **Pi-Agent**：底层 Agent 框架，当前 vendored 在 `vendor/pi`
- **DSH (DeepSeek Harness)**：前端 Web GUI 框架

---

*文档生成时间：2026-08-24*
*版本：v3.1（深度优化：增加技术预研、数据库选型评估、并发控制、冷启动策略、模型行为审计、技能导出、遗忘机制、安全护栏）*
