'use client';

import {
  type FinancePermissionRequestUser,
  FinancePermissionWarningContent,
} from '@tuturuuu/ui/finance/shared/finance-permission-warning-dialog';
import { useTranslations } from 'next-intl';

interface InvoiceAccessDeniedProps {
  user: FinancePermissionRequestUser;
}

export function InvoiceAccessDenied({ user }: InvoiceAccessDeniedProps) {
  const t = useTranslations();

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center px-4 py-10">
      <section className="w-full overflow-hidden rounded-xl border bg-card shadow-sm">
        <header className="border-b bg-muted/30 px-5 py-4 sm:px-6">
          <p className="font-semibold text-base">
            {t('finance-permission-warning.title')}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('finance-permission-warning.dialog_description')}
          </p>
        </header>
        <div className="px-5 py-5 sm:px-6">
          <FinancePermissionWarningContent
            missingPermissions={['view_invoices']}
            user={user}
          />
        </div>
      </section>
    </main>
  );
}
