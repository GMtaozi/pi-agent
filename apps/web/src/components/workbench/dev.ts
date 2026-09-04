import { WorkbenchConfig } from './WorkbenchConfig';
import { GitPullRequest, FlaskConical, Wand2, Bug } from 'lucide-react';

export const devWorkbenchConfig: WorkbenchConfig = {
  name: '开发者工作台',
  subtitle: '为开发者量身定制的 Agent 工作流，提升编码效率',
  route: '/dev-workbench',
  returnPath: '/dev-workbench',
  tasks: [
    {
      id: 'pr-review',
      title: '审查 PR',
      description: '自动审查代码变更，识别潜在问题并给出改进建议',
      icon: GitPullRequest,
      time: '2-5 分钟',
      templateId: 'code-review-pr',
      badge: '推荐',
      color: 'blue',
    },
    {
      id: 'generate-tests',
      title: '生成测试',
      description: '分析代码逻辑，自动生成单元测试和集成测试用例',
      icon: FlaskConical,
      time: '3-8 分钟',
      templateId: 'code-review',
      color: 'purple',
    },
    {
      id: 'refactor',
      title: '重构建议',
      description: '分析代码结构，识别技术债务，输出重构方案',
      icon: Wand2,
      time: '5-10 分钟',
      templateId: 'code-review',
      color: 'green',
    },
    {
      id: 'debug',
      title: '调试分析',
      description: '分析错误日志，定位根因，给出修复建议',
      icon: Bug,
      time: '2-5 分钟',
      templateId: 'parallel-analysis',
      color: 'orange',
    },
  ],
};
