# dev server EPERM 问题解决方案

> 日期：2026-08-21
> 状态：环境级阻塞项，已记录解决方案
> 影响：前端 dev server 启动失败，阻塞前端验证

---

## 一、问题描述

在 Windows 环境下启动前端 dev server 时，可能出现 `EPERM` 错误，通常与 esbuild 子进程启动失败有关。

**常见错误信息：**
```
Error: EPERM: operation not permitted, ...
at ...
code: 'EPERM'
errno: -4048
syscall: '...'
path: '...'
```

---

## 二、常见原因

1. **Windows Defender 实时保护**：杀毒软件锁定了 esbuild 二进制文件
2. **文件/目录权限不足**：当前用户对项目目录没有完全控制权限
3. **防火墙/安全软件拦截**：第三方安全软件阻止了子进程创建
4. **Windows 资源管理器锁定**：文件被其他进程占用

---

## 三、解决方案

### 方案 1：关闭 Windows Defender 实时保护（推荐）

1. 打开 **Windows 安全中心** → **病毒和威胁防护**
2. 点击 **管理设置**
3. 关闭 **实时保护**（临时）
4. 重新运行 dev server

### 方案 2：将项目目录加入 Defender 排除项

1. 打开 **Windows 安全中心** → **病毒和威胁防护**
2. 点击 **管理设置** → **排除项**
3. 点击 **添加排除项** → **文件夹**
4. 选择项目目录：`D:\Project\pi-agent`
5. 重新运行 dev server

### 方案 3：以管理员身份运行 PowerShell

1. 右键点击 PowerShell → **以管理员身份运行**
2. 导航到项目目录：
   ```powershell
   cd D:\Project\pi-agent
   ```
3. 运行 dev server：
   ```powershell
   pnpm dev:web
   ```

### 方案 4：检查目录权限

1. 右键点击项目目录 → **属性** → **安全**
2. 确认当前用户有 **完全控制** 权限
3. 如果没有，点击 **编辑** → 勾选 **完全控制** → **应用**

### 方案 5：关闭防火墙/安全软件（临时）

1. 暂时关闭第三方防火墙或安全软件
2. 重新运行 dev server
3. 验证后重新开启安全软件

### 方案 6：使用 WSL 或 Docker（终极方案）

如果以上方案均无效，建议使用 WSL 2 或 Docker 环境：

**WSL 2 方案：**
1. 安装 WSL 2 和 Ubuntu
2. 在 WSL 中克隆项目
3. 运行 dev server

**Docker 方案：**
1. 使用 Docker 容器运行前端服务
2. 端口映射到宿主机

---

## 四、验证步骤

执行任一方案后，验证 dev server 是否正常启动：

```powershell
# 进入项目目录
cd D:\Project\pi-agent

# 启动前端 dev server
pnpm dev:web
```

**预期输出：**
```
  VITE vX.X.X  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

如果仍然失败，请检查：
1. 是否有其他进程占用 5173 端口
2. Node.js 版本是否兼容（建议 18+）
3. pnpm 版本是否最新

---

## 五、预防措施

1. **保持 Defender 排除项**：将项目目录永久加入排除项
2. **定期更新依赖**：`pnpm update`
3. **使用 LTS 版本 Node.js**：避免版本兼容问题
4. **避免在项目目录中打开过多文件**：减少文件锁定概率

---

## 六、相关文档

- `docs/修复计划-2026-08-21.md` — 总体修复计划
- `docs/修复报告-P0阶段-2026-08-21.md` — P0 阶段修复报告
- `docs/修复总结报告-2026-08-21.md` — P0/P1 修复总结
- `docs/修复报告-Phase2-2026-08-21.md` — Phase 2 清理报告
