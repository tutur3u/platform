import {
  Bot,
  CalendarClock,
  CircleCheck,
  LayoutDashboard,
  LineChart,
  ListTodo,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'tasks',
  accent: 'green',
  icon: CircleCheck,
  primaryHref: 'https://tasks.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'organize', icon: ListTodo },
    { key: 'assistant', icon: Bot },
    { key: 'collaborate', icon: Users },
    { key: 'deadlines', icon: CalendarClock },
    { key: 'views', icon: LayoutDashboard },
    { key: 'insights', icon: LineChart },
  ],
  useCases: [
    { key: 'personal', itemCount: 4 },
    { key: 'team', itemCount: 4 },
    { key: 'operations', itemCount: 4 },
  ],
};

export default function TasksProductPage() {
  return <ProductPage config={config} />;
}
