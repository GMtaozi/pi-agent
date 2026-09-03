# pi-agent

> A production-ready AI agent platform with multi-tenant support, knowledge base, workflow orchestration, and real-time collaboration.

[![Tests](https://img.shields.io/badge/tests-139%20passed-brightgreen)](docs/audit-2026-09-03.md)
[![Bundle](https://img.shields.io/badge/bundle-107%20KB-blue)](apps/web)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## ✨ Features

- 🤖 **Multi-Agent Engine** — Create, configure, and deploy AI agents with custom system prompts, tools, and knowledge bases
- 📚 **Knowledge Base** — Upload documents (PDF, DOCX, TXT, MD), automatic chunking, hybrid search (vector + keyword)
- 🔄 **Workflow Editor** — Visual workflow builder with ReactFlow, supporting multi-agent orchestration
- 🐛 **Debug Panel** — Real-time execution monitoring, breakpoints, step-through debugging
- 🔐 **Security** — JWT + session token auth, bcrypt password hashing, AES-256-GCM encryption at rest
- 📊 **Monitoring** — Execution tracking, cost analysis, performance metrics
- 🧩 **Skills Marketplace** — Extensible skill system with sandboxed tool execution
- 💬 **Real-time Chat** — WebSocket-powered streaming with heartbeat and timeout handling

## 🏗️ Architecture

```
pi-agent/
├── apps/
│   ├── server/          # Fastify REST API + WebSocket server
│   └── web/             # React SPA (Vite + ReactFlow)
├── packages/
│   ├── agents/          # Agent CRUD and configuration
│   ├── auth/            # JWT token creation/verification
│   ├── debug/           # Debug session management
│   ├── governance/      # Policy engine and audit logging
│   ├── knowledge/       # Document processing and search
│   ├── memory/          # In-memory text/tag indexing
│   ├── orchestrator/    # Multi-agent task scheduling
│   ├── persistence/     # SQLite/Postgres database layer
│   ├── schedule/        # Cron-based task scheduling
│   ├── settings/        # Encrypted app configuration
│   ├── storage/         # S3-compatible object storage
│   ├── workflow/        # Workflow engine
│   └── ...              # logging, monitoring, skills, etc.
└── vendor/
    └── pi/              # Vendored pi-ai/pi-agent-core
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- (Optional) PostgreSQL 15+ / Redis / MinIO

### Installation

```bash
# Clone the repository
git clone https://github.com/GMtaozi/pi-agent.git
cd pi-agent

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env and set all required secrets (see Security section below)
```

### Development

```bash
# Start backend (terminal 1)
pnpm --filter server dev

# Start frontend (terminal 2)
pnpm --filter web dev

# Open http://localhost:5173
```

### Build for Production

```bash
pnpm build
pnpm start
```

## 🔑 Security Configuration

**All secrets are required.** The application will refuse to start if any are missing.

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs access tokens |
| `REFRESH_SECRET` | Signs refresh tokens |
| `API_KEY_ENCRYPTION_KEY` | Encrypts API keys at rest |
| `SESSION_SECRET` | Signs legacy session tokens |
| `ADMIN_PASSWORD` | Login password for `/api/auth/login` |
| `DB_ENCRYPTION_KEY` | Encrypts custom model API keys in DB |
| `CONFIG_MASTER_SECRET` | Additional salt for settings encryption |

## 🧪 Testing

```bash
# Run all unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run E2E tests (requires Playwright)
npx playwright install chromium
pnpm e2e
```

**Current coverage: 139 unit tests + 7 E2E tests passing.**

## 📦 Deployment

### Docker

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Manual

```bash
# Set NODE_ENV=production and all secrets in .env
pnpm build
pnpm start
```

See [deploy.sh](deploy.sh) for production deployment checklist.

## 📚 Documentation

- [Audit Report](docs/audit-2026-09-03.md) — Security audit and fixes
- [API Docs](docs/接口定义文档.md) — REST API reference
- [Phase 5 Feature](docs/phase5-feature-analysis.md) — Workflow persistence

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## 📄 License

MIT

---

Built with ❤️ using Fastify, React, and TypeScript.
