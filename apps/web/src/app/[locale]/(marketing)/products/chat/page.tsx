import {
  Bot,
  Hash,
  Layers,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Search,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'chat',
  accent: 'cyan',
  icon: MessageSquare,
  primaryHref: 'https://chat.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'channels', icon: Hash },
    { key: 'direct', icon: MessageCircle },
    { key: 'workspace', icon: Layers },
    { key: 'files', icon: Paperclip },
    { key: 'search', icon: Search },
    { key: 'agents', icon: Bot },
  ],
  useCases: [
    { key: 'team', itemCount: 4 },
    { key: 'projects', itemCount: 4 },
    { key: 'personal', itemCount: 4 },
  ],
};

export default function ChatProductPage() {
  return <ProductPage config={config} />;
}
