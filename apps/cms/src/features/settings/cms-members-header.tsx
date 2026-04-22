'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

export function CmsMembersHeader({
  boundProjectName,
  canManageRoles,
}: {
  boundProjectName?: string | null;
  canManageRoles: boolean;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-gradient-to-br from-background via-background to-dynamic-blue/5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-5 p-6 lg:p-8">
        <div className="space-y-3">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {t('common.members')}
          </Badge>
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl tracking-tight">
              {tSettings('members_title')}
            </h1>
            <p className="max-w-3xl text-muted-foreground text-sm leading-6">
              {tSettings('members_description')}
            </p>
          </div>
        </div>

        <div className="grid min-w-[280px] gap-3 sm:grid-cols-2">
          <Card className="border-border/70 bg-background/80 shadow-none">
            <CardContent className="p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                {tSettings('bound_project_label')}
              </div>
              <div className="mt-2 font-semibold text-lg">
                {boundProjectName || t('external-projects.root.unbound_label')}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-background/80 shadow-none">
            <CardContent className="p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                {t('common.roles')}
              </div>
              <div className="mt-2 font-semibold text-lg">
                {canManageRoles
                  ? tSettings('member_access_managed')
                  : tSettings('member_access_read_only')}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
