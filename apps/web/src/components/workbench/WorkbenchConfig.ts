import { ComponentType } from 'react';

export interface WorkbenchTask {
  id: string;
  title: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  icon: ComponentType<any>;
  time: string;
  templateId: string;
  color?: 'blue' | 'purple' | 'cyan' | 'green' | 'orange';
  badge?: string;
  source?: 'preset' | 'market';
}

export interface WorkbenchConfig {
  name: string;
  subtitle: string;
  route: string;
  returnPath: string;
  tasks: WorkbenchTask[];
}
