import { Users } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';

export default async function UsersOverviewPage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-dynamic-blue/10 text-dynamic-blue">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl">
            {t('workspace-users-tabs.overview')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('sidebar_tabs.users')}
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border border-dashed bg-background p-8 text-center text-muted-foreground">
        {t('common.coming_soon')}
      </div>
    </div>
  );
}
