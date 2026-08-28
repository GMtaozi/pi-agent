# Phase 1 功能规划

> 日期：2026-08-17
> 状态：待评审
> 前置条件：Phase 0 已完成（38/38 验收测试通过）

---

## 一、Phase 0 交付回顾

### 已完成核心能力
- monorepo 脚手架：apps/{web,server}, packages/*
- Pi SDK 接入：AgentEngine、ModelRuntime
- 会话管理：创建/列出/详情/删除、SSE 流式
- 基础工具：read_file / write_file / edit_file
- 工作台服务：文件树、CRUD、缓存、WebSocket 广播
- 记忆服务：JSON 索引、增删查
- 设置服务：API Key 加密存储、Settings API
- 日志与监控：结构化日志、Metrics、Dashboard、Alerts、Health、Logs
- 前端页面：Chat / Workspace / Memory / Settings / Monitoring
- 性能与稳定性：LRU 缓存、重试、超时、错误处理

### 当前系统限制
- 受系统 EPERM 限制，dev server 无法在本机启动
- 多模态能力仅停留在架构设计，尚未接入
- Skills 插件体系未实现
- 产物预览能力有限（仅文本/代码）
- 无任务调度与治理审批流程

---

## 二、Phase 1 目标

**主题**：从"文本对话 + 文件工作台"演进为"多模态产物工厂"。

**核心目标**：
1. 接入多模态生成能力（图片、视频、语音）
2. 实现 Skills 插件体系
3. 增强产物预览与版本管理
4. 引入任务调度与治理审批
5. 提升前端体验与交互深度

---

## 三、Phase 1 功能模块

### 模块 1：多模态工具层

新增工具：
- generate_image：文生图 / 图生图
- generate_video：文生视频 / 图生视频
- generate_audio：TTS / 语音克隆
- transcribe_audio：语音转文字
- analyze_image：图片理解 / OCR

### 模块 2：Skills 插件体系

核心概念：
- Skill = 一组预配置的工具 + 系统提示词 + 参数模板
- Capability = 底层模型/API 能力
- SkillRegistry = 全局技能注册中心
- SkillLoader = 热加载器

### 模块 3：产物预览与版本管理

预览能力：
- HTML 沙箱 iframe
- Markdown / 代码高亮
- 图片 / 视频 / 音频直接播放
- PDF 嵌入预览

版本管理：
- 自动版本快照
- 版本对比（diff）
- 一键回滚

### 模块 4：任务调度与治理审批

任务调度：
- cron 表达式调度
- 任务队列持久化
- 状态跟踪

治理审批：
- 敏感操作需审批
- 审批流程：提交 → 待审批 → 批准/拒绝
- 审计日志

### 模块 5：前端体验增强

- 对话面板：多轮折叠、代码高亮、产物引用卡片
- 工作台：拖拽排序、批量操作、内联预览
- Skills 面板：技能卡片、启用/禁用
- 设置面板：模型选择、主题切换
- 通用：响应式布局、骨架屏、快捷键

---

## 四、实施顺序

| 周次 | 模块 | 关键任务 |
|------|------|----------|
| Week 1 | M1 多模态 | generate_image / analyze_image 接入 |
| Week 1-2 | M1 多模态 | generate_video / generate_audio / transcribe |
| Week 2 | M2 Skills | SkillRegistry / SkillLoader / skill.json |
| Week 2 | M2 Skills | Server 端点 + 前端 Skills 面板 |
| Week 3 | M3 预览版本 | 预览代理 + 版本快照 |
| Week 3 | M4 调度治理 | Schedule + Approval 服务 |
| Week 3-4 | M4 调度治理 | Audit Log + 前端组件 |
| Week 4 | M5 前端增强 | 对话/工作台/设置体验优化 |
| Week 4 | 集成测试 | 端到端场景跑通 |

---

## 五、技术风险与应对

| 风险 | 影响 | 概率 | 应对 |
|------|------|------|------|
| 多模态 API 成本高 | 用户使用门槛 | 中 | 免费额度 + 按量计费 + 本地模型 |
| 大产物文件 I/O 阻塞 | 性能 | 中 | 流式上传/下载 + 后台队列 |
| Skills 热加载冲突 | 稳定性 | 低 | 版本快照 + 加载验证 + 回滚 |
| 前端复杂度上升 | 交付周期 | 中 | 组件复用 + 设计系统 + 渐进增强 |
| 审批流程过于繁琐 | 用户体验 | 低 | 白名单机制 + 批量审批 |

---

## 六、Phase 1 验收标准

### 功能验收
- 可通过对话生成图片/视频/语音，产物进入工作台
- Skills 可热加载、可组合、可前端管理
- 产物支持预览（HTML/图片/视频/音频/Markdown/代码）
- 文件变更有版本历史、可对比、可回滚
- 长时间任务可调度、可审批、可审计

### 非功能验收
- 多模态工具调用 P95 < 10s（不含模型推理时间）
- 前端首屏加载 < 3s
- 支持 1000+ 文件工作台无卡顿
- 审计日志不可篡改（只追加）

### 质量验收
- 类型检查全部通过
- Phase 1 验收测试通过率 >= 95%
- 关键路径有错误处理与降级策略
- 文档更新至 Phase 1 完成状态

---

## 七、Phase 2 展望

- 多用户协作与权限体系
- 云端同步与备份
- 移动端 App
- 本地模型微调
- 更丰富的 Skills 市场
