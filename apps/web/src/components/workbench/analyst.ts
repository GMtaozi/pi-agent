import { WorkbenchConfig } from './WorkbenchConfig';
import { Database, TrendingUp, BarChart3, AlertTriangle } from 'lucide-react';

export const analystWorkbenchConfig: WorkbenchConfig = {
  name: '运营/分析师工作台',
  subtitle: '数据提取、趋势分析与报告生成的 Agent 工作流',
  route: '/analyst-workbench',
  returnPath: '/analyst-workbench',
  tasks: [
    {
      id: 'data-extract',
      title: '数据提取',
      description: '从指定数据源提取关键指标和维度',
      icon: Database,
      time: '2-5 分钟',
      templateId: 'data-report',
      color: 'cyan',
    },
    {
      id: 'trend-analysis',
      title: '趋势分析',
      description: '分析数据趋势，识别模式和变化',
      icon: TrendingUp,
      time: '3-8 分钟',
      templateId: 'data-report',
      color: 'green',
    },
    {
      id: 'report-generate',
      title: '报告生成',
      description: '生成可视化数据报告和摘要',
      icon: BarChart3,
      time: '5-10 分钟',
      templateId: 'data-report',
      badge: '推荐',
      color: 'purple',
    },
    {
      id: 'anomaly-detect',
      title: '异常检测',
      description: '识别数据中的异常模式',
      icon: AlertTriangle,
      time: '2-5 分钟',
      templateId: 'parallel-analysis',
      color: 'orange',
    },
  ],
};
