'use client';

import { Settings } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

interface AccountStatusSectionProps {
  user: WorkspaceUser | null;
}

export default function AccountStatusSection({
  user,
}: AccountStatusSectionProps) {
  const t = useTranslations('settings-account');

  return (
    <div className="rounded-lg border bg-linear-to-r from-emerald-50/50 to-green-50/50 p-4 dark:from-emerald-950/20 dark:to-green-950/20">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-full bg-emerald-100 p-1.5 dark:bg-emerald-900/30">
          <Settings className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h4 className="font-medium text-emerald-900 dark:text-emerald-100">
          {t('account-status')}
        </h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">{t('status')}</span>
          <Badge
            variant="default"
            className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          >
            {t('active')}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {t('email-verified')}
          </span>
          <Badge variant="secondary">{t('verified')}</Badge>
        </div>
        {user?.created_at && (
          <div className="flex items-center justify-between sm:col-span-2">
            <span className="text-muted-foreground text-sm">
              {t('member-since')}
            </span>
            <span className="font-medium text-sm">
              {new Date(user.created_at).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
