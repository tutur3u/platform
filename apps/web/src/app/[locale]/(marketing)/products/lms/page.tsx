import {
  BookOpen,
  Brain,
  FileText,
  GraduationCap,
  LineChart,
  MessageSquare,
  Video,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'lms',
  accent: 'orange',
  icon: GraduationCap,
  primaryHref: 'https://learn.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'courses', icon: BookOpen },
    { key: 'progress', icon: LineChart },
    { key: 'assignments', icon: FileText },
    { key: 'practice', icon: Brain },
    { key: 'live', icon: Video },
    { key: 'discussion', icon: MessageSquare },
  ],
  useCases: [
    { key: 'institutions', itemCount: 4 },
    { key: 'corporate', itemCount: 4 },
    { key: 'centers', itemCount: 4 },
  ],
};

export default function LMSProductPage() {
  return <ProductPage config={config} />;
}
