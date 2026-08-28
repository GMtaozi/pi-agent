import { WorkbenchLayout } from '../components/workbench';
import { analystWorkbenchConfig } from '../components/workbench/analyst';

export default function AnalystWorkbenchPage({ onBack }: { onBack?: () => void } = {}) {
  return <WorkbenchLayout config={analystWorkbenchConfig} onBack={onBack} loadMarketSkills />;
}
