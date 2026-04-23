'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

export function CmsMembersHeader({
  boundProjectName,
  invitedCount,
  joinedCount,
  totalCount,
}: {
  boundProjectName?: null | string;
  invitedCount: number;
  joinedCount: number;
  totalCount: number;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="font-semibold text-3xl tracking-tight">
          {tSettings('members_title')}
        </h1>
        <p className="max-w-3xl text-muted-foreground text-sm leading-6">
          {tSettings('members_description')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="rounded-full px-3 py-1">
          {t('common.total')}: {totalCount}
        </Badge>
        <Badge variant="outline" className="rounded-full px-3 py-1">
          {t('ws-members.active_members')}: {joinedCount}
        </Badge>
        <Badge variant="outline" className="rounded-full px-3 py-1">
          {t('ws-members.pending_invitations')}: {invitedCount}
        </Badge>
        <Badge variant="secondary" className="rounded-full px-3 py-1">
          {tSettings('bound_project_label')}:{' '}
          {boundProjectName || t('external-projects.root.unbound_label')}
        </Badge>
      </div>
    </section>
  );
}
