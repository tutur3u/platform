import {
  Bot,
  Braces,
  GitBranch,
  Layers,
  Workflow,
  Zap,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'workflows',
  accent: 'cyan',
  icon: Workflow,
  primaryHref: '/onboarding',
  features: [
    { key: 'builder', icon: Workflow },
    { key: 'triggers', icon: Zap },
    { key: 'templates', icon: Layers },
    { key: 'versions', icon: GitBranch },
    { key: 'assistant', icon: Bot },
    { key: 'integrations', icon: Braces },
  ],
  useCases: [
    { key: 'approvals', itemCount: 4 },
    { key: 'team', itemCount: 4 },
    { key: 'systems', itemCount: 4 },
  ],
};

export default function WorkflowsProductPage() {
  return <ProductPage config={config} />;
}
