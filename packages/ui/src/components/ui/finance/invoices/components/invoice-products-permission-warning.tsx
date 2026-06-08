'use client';

import { AlertTriangle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  type FinancePermissionRequestUser,
  FinancePermissionWarningDialog,
} from '../../shared/finance-permission-warning-dialog';

interface InvoiceProductsPermissionWarningProps {
  missingPermissions: string[];
  user?: FinancePermissionRequestUser | null;
}

export function InvoiceProductsPermissionWarning({
  missingPermissions,
  user,
}: InvoiceProductsPermissionWarningProps) {
  const t = useTranslations();
  const uniqueMissingPermissions = [...new Set(missingPermissions)];

  if (uniqueMissingPermissions.length === 0) return null;

  return (
    <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-orange" />
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {t('finance-permission-warning.summary')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('finance-permission-warning.description')}
            </p>
          </div>
          <FinancePermissionWarningDialog
            missingPermissions={uniqueMissingPermissions}
            user={user}
            trigger={
              <Button type="button" variant="outline" size="sm">
                {t('finance-permission-warning.open_request')}
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}

export function isPermissionRequestError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const status = 'status' in error ? Number(error.status) : 0;
  return status === 401 || status === 403;
}
