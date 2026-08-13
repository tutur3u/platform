'use client';

import { CreditCard, ShieldCheck, TriangleAlert } from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { useTranslations } from 'next-intl';

export function WorkspaceAccessInvitePosPanel({
  confirmDefaultAdminMigration,
  defaultAdminEnabled,
  joinedMemberCount,
  onConfirmDefaultAdminMigrationChange,
}: {
  confirmDefaultAdminMigration: boolean;
  defaultAdminEnabled: boolean;
  joinedMemberCount: number;
  onConfirmDefaultAdminMigrationChange: (value: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-3 rounded-xl border border-dynamic-blue/25 bg-dynamic-blue/5 p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-dynamic-blue/20 bg-background p-2 text-dynamic-blue">
          <CreditCard className="size-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-sm">
            {t('ws-members.pos_operator_title')}
          </p>
          <p className="text-muted-foreground text-sm leading-5">
            {t('ws-members.pos_operator_description')}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {defaultAdminEnabled ? (
          <div className="flex items-center gap-2 rounded-lg border bg-background/70 p-3 text-sm">
            <ShieldCheck className="size-4 text-dynamic-green" />
            <span>
              {joinedMemberCount}{' '}
              {t('ws-members.pos_operator_existing_members')}
            </span>
          </div>
        ) : null}
        <div className="flex items-center gap-2 rounded-lg border bg-background/70 p-3 text-sm">
          <CreditCard className="size-4 text-dynamic-blue" />
          <span>{t('ws-members.pos_operator_only_permission')}</span>
        </div>
      </div>

      {defaultAdminEnabled ? (
        <div className="flex items-start gap-2 rounded-lg border border-dynamic-orange/25 bg-dynamic-orange/5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-dynamic-orange" />
          <p className="text-muted-foreground leading-5">
            {t('ws-members.pos_operator_admin_migration_note')}
          </p>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/20 active:scale-[0.99]">
        <Checkbox
          checked={confirmDefaultAdminMigration}
          className="mt-0.5"
          onCheckedChange={(checked) =>
            onConfirmDefaultAdminMigrationChange(checked === true)
          }
        />
        <span className="text-sm leading-5">
          {t('ws-members.pos_operator_confirmation')}
        </span>
      </label>
    </div>
  );
}
