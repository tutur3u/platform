import {
  FileSearch,
  FolderTree,
  HardDrive,
  History,
  Lock,
  Share2,
  Smartphone,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'drive',
  accent: 'yellow',
  icon: HardDrive,
  primaryHref: 'https://drive.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'storage', icon: Lock },
    { key: 'sharing', icon: Share2 },
    { key: 'search', icon: FileSearch },
    { key: 'organization', icon: FolderTree },
    { key: 'versions', icon: History },
    { key: 'devices', icon: Smartphone },
  ],
  useCases: [
    { key: 'team', itemCount: 4 },
    { key: 'delivery', itemCount: 4 },
    { key: 'records', itemCount: 4 },
  ],
};

export default function DriveProductPage() {
  return <ProductPage config={config} />;
}
