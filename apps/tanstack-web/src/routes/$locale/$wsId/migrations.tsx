import { createFileRoute, redirect } from '@tanstack/react-router';
import { Archive, ShieldAlert } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute('/$locale/$wsId/migrations')({
  component: WorkspaceMigrationsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Review the decommissioned workspace migration dashboard status.',
      locale,
      title: 'Migrations',
    });
  },
  loader: async ({ params }) => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/migrations`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists || workspace.workspaceId !== ROOT_WORKSPACE_ID) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const canViewInfrastructure = await hasWorkspacePermission({
      data: {
        permission: 'view_infrastructure',
        wsId: ROOT_WORKSPACE_ID,
      },
    });

    if (!canViewInfrastructure) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    return {};
  },
});

function WorkspaceMigrationsRoute() {
  const t = useTranslations('workspace-migrations');

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
      <section className="w-full max-w-2xl rounded-lg border border-border bg-background p-6 shadow-sm">
        <div className="space-y-4">
          <Badge variant="secondary" className="gap-2">
            <Archive className="h-3.5 w-3.5" />
            {t('retired_badge')}
          </Badge>

          <div className="space-y-2">
            <h1 className="font-bold text-2xl tracking-normal">
              {t('retired_title')}
            </h1>
            <p className="text-foreground/70">{t('retired_description')}</p>
          </div>

          <Separator />

          <div className="rounded-lg border border-border bg-foreground/5 p-4">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-foreground/70" />
              <div className="space-y-2">
                <h2 className="font-semibold text-base">
                  {t('retired_guard_title')}
                </h2>
                <p className="text-foreground/70 text-sm">
                  {t('retired_guard_description')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
