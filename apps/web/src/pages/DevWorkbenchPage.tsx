import { WorkbenchLayout } from '../components/workbench';
import { devWorkbenchConfig } from '../components/workbench/dev';

export default function DevWorkbenchPage({ onBack }: { onBack?: () => void } = {}) {
  return <WorkbenchLayout config={devWorkbenchConfig} onBack={onBack} loadMarketSkills />;
}
