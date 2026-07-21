import {
  Activity,
  Blocks,
  Bot,
  Play,
  SlidersHorizontal,
  Workflow,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'hive',
  accent: 'purple',
  icon: Blocks,
  primaryHref: 'https://hive.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'world', icon: Blocks },
    { key: 'agents', icon: Bot },
    { key: 'prompts', icon: SlidersHorizontal },
    { key: 'runs', icon: Play },
    { key: 'workflows', icon: Workflow },
    { key: 'observe', icon: Activity },
  ],
  useCases: [
    { key: 'research', itemCount: 4 },
    { key: 'design', itemCount: 4 },
    { key: 'teaching', itemCount: 4 },
  ],
};

export default function HiveProductPage() {
  return <ProductPage config={config} />;
}
