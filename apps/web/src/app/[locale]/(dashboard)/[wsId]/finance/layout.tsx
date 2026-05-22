import { FinanceRouteProvider } from '@tuturuuu/ui/finance/finance-route-context';
import type { ReactNode } from 'react';

export default function WebFinanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <FinanceRouteProvider prefix="/finance">{children}</FinanceRouteProvider>
  );
}
