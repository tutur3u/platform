import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Smartphone } from '@tuturuuu/icons';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api/client';
import { getMobileVersionPolicies } from '@tuturuuu/internal-api/infrastructure/mobile';
import type { MobileVersionPoliciesPayload } from '@tuturuuu/internal-api/infrastructure/types';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { MobileVersionSettingsForm } from '@/components/infrastructure/mobile-versions/mobile-version-settings-form';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type MobileVersionsData = {
  policies: MobileVersionPoliciesPayload;
};

const loadMobileVersionPolicies = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MobileVersionPoliciesPayload> => {
    return getMobileVersionPolicies(
      withForwardedInternalApiAuth(getRequestHeaders())
    );
  }
);

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/mobile-versions'
)({
  component: MobileVersionsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage enforced mobile app versions for iOS and Android.',
      locale,
      title: 'Mobile Versions',
    });
  },
  loader: async ({ params }): Promise<MobileVersionsData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/mobile-versions`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    if (workspace.workspaceId !== ROOT_WORKSPACE_ID) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const canManageWorkspaceRoles = await hasWorkspacePermission({
      data: {
        permission: 'manage_workspace_roles',
        wsId: ROOT_WORKSPACE_ID,
      },
    });
    if (!canManageWorkspaceRoles) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const policies = await loadMobileVersionPolicies();

    return { policies };
  },
});

function MobileVersionsRoutePage() {
  const data = Route.useLoaderData() as MobileVersionsData;
  const t = useTranslations('mobile-version-settings');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <MobileVersionSettingsForm initialData={data.policies} />
    </>
  );
}
