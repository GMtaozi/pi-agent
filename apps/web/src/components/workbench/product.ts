import { WorkbenchConfig } from './WorkbenchConfig';
import { FileText, Search, UserCheck, Globe } from 'lucide-react';

export const productWorkbenchConfig: WorkbenchConfig = {
  name: '产品经理工作台',
  subtitle: '需求分析、PRD 生成与竞品调研的 Agent 工作流',
  route: '/product-workbench',
  returnPath: '/product-workbench',
  tasks: [
    {
      id: 'prd-generate',
      title: 'PRD 生成',
      description: '从需求描述生成完整的产品需求文档',
      icon: FileText,
      time: '5-10 分钟',
      templateId: 'requirements-analysis',
      badge: '推荐',
      color: 'blue',
    },
    {
      id: 'requirement-analysis',
      title: '需求分析',
      description: '分析需求文档，提炼核心功能点',
      icon: Search,
      time: '3-8 分钟',
      templateId: 'requirements-analysis',
      color: 'purple',
    },
    {
      id: 'user-story-breakdown',
      title: '用户故事拆解',
      description: '从需求生成用户故事列表',
      icon: UserCheck,
      time: '2-5 分钟',
      templateId: 'requirements-analysis',
      color: 'green',
    },
    {
      id: 'competitor-research',
      title: '竞品调研',
      description: '调研竞品，生成分析报告',
      icon: Globe,
      time: '5-15 分钟',
      templateId: 'research-then-write',
      color: 'orange',
    },
  ],
};
