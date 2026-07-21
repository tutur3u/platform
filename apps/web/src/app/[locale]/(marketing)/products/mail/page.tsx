import {
  Bot,
  Calendar,
  Clock,
  Inbox,
  Mail,
  MessagesSquare,
  Search,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'mail',
  accent: 'red',
  icon: Mail,
  primaryHref: 'https://mail.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'inbox', icon: Inbox },
    { key: 'assistant', icon: Bot },
    { key: 'search', icon: Search },
    { key: 'calendar', icon: Calendar },
    { key: 'schedule', icon: Clock },
    { key: 'shared', icon: MessagesSquare },
  ],
  useCases: [
    { key: 'clients', itemCount: 4 },
    { key: 'team', itemCount: 4 },
    { key: 'followups', itemCount: 4 },
  ],
};

export default function MailProductPage() {
  return <ProductPage config={config} />;
}
