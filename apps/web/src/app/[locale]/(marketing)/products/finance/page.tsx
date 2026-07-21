import {
  Calculator,
  CreditCard,
  FileSpreadsheet,
  LineChart,
  Receipt,
  Wallet,
  Wallet2,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'finance',
  accent: 'pink',
  icon: Wallet,
  primaryHref: 'https://finance.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'expenses', icon: Receipt },
    { key: 'budgets', icon: Wallet2 },
    { key: 'reports', icon: FileSpreadsheet },
    { key: 'payments', icon: CreditCard },
    { key: 'cashflow', icon: LineChart },
    { key: 'planning', icon: Calculator },
  ],
  useCases: [
    { key: 'business', itemCount: 4 },
    { key: 'personal', itemCount: 4 },
    { key: 'planning', itemCount: 4 },
  ],
};

export default function FinanceProductPage() {
  return <ProductPage config={config} />;
}
