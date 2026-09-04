import { WorkbenchLayout } from '../components/workbench';
import { productWorkbenchConfig } from '../components/workbench/product';

export default function ProductWorkbenchPage({ onBack }: { onBack?: () => void } = {}) {
  return <WorkbenchLayout config={productWorkbenchConfig} onBack={onBack} loadMarketSkills />;
}
