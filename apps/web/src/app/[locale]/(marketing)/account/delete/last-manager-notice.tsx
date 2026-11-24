'use client';

import { ShieldAlert } from '@tuturuuu/icons/lucide';
import type { AccountDeletionLastManagerWorkspace } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';

export function LastManagerNotice({
  workspaces,
}: {
  workspaces: AccountDeletionLastManagerWorkspace[];
}) {
  const t = useTranslations('settings-account');

  return (
    <div
      role="alert"
      className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3"
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
          <p className="font-medium text-dynamic-orange text-sm">
            {t('delete-account-last-manager')}
          </p>
        </div>
        {workspaces.length > 0 && (
          <div className="space-y-2">
            <p className="text-dynamic-orange/80 text-xs">
              {t('delete-account-last-manager-workspaces')}
            </p>
            <ul className="space-y-2">
              {workspaces.map((ws) => (
                <li
                  key={ws.id}
                  className="rounded-md bg-dynamic-orange/10 px-3 py-2 font-medium text-sm"
                >
                  {ws.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
