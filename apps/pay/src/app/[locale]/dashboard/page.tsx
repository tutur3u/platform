import { CreditCard } from '@tuturuuu/icons';
import { checkManageSubscriptionPermission } from '@tuturuuu/payment-core/billing-helper';
import { resolveSatellitePageActor } from '@tuturuuu/satellite/workspace-access';
import {
  getPendingWorkspaceInvitations,
  SatelliteWorkspaceInvitationList,
} from '@tuturuuu/satellite/workspace-invitation';
import { getWorkspaces } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { WEB_APP_URL } from '@/constants/common';
import { Link, redirect } from '@/i18n/navigation';

export default async function DashboardEntryPage() {
  await connection();
  const locale = await getLocale();
  const requestHeaders = await headers();
  const actor = await resolveSatellitePageActor('pay');

  if (!actor) {
    return redirect({ href: '/login?next=/dashboard', locale });
  }

  const invitations = await getPendingWorkspaceInvitations(requestHeaders);

  if (invitations.length > 0) {
    return (
      <SatelliteWorkspaceInvitationList
        afterDeclineHref="/dashboard"
        invitations={invitations}
      />
    );
  }

  const workspaces = await getWorkspaces({ user: actor.user });
  if (!workspaces) throw new Error('Failed to load Pay workspaces');

  const billingWorkspaces = [];
  for (const workspace of workspaces) {
    if (
      await checkManageSubscriptionPermission(
        actor.admin,
        workspace.id,
        actor.user.id
      )
    ) {
      billingWorkspaces.push(workspace);
    }
  }

  if (billingWorkspaces.length === 1) {
    return redirect({
      href: `/${billingWorkspaces[0]!.id}/billing`,
      locale,
    });
  }

  const t = await getTranslations('pay-dashboard');

  return (
    <main className="flex min-h-screen items-center justify-center bg-root-background p-6">
      <div className="w-full max-w-lg border-2 border-border bg-background p-8 text-center shadow-[9px_9px_0_var(--border)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border-2 border-border bg-muted shadow-[4px_4px_0_var(--border)]">
          <CreditCard className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="font-black text-3xl tracking-normal">{t('title')}</h1>
        <p className="mt-3 text-muted-foreground leading-7">
          {t(
            billingWorkspaces.length > 0 ? 'choose-workspace' : 'no-workspaces'
          )}
        </p>
        {billingWorkspaces.length > 0 ? (
          <ul className="mt-6 space-y-3 text-left">
            {billingWorkspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/${workspace.id}/billing`}
                  className="block break-words border-2 border-border px-4 py-3 font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                  {workspace.name || t('unnamed-workspace')}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <a
            href={`${WEB_APP_URL}/${locale}`}
            className="mt-6 inline-block border-2 border-border px-4 py-3 font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {t('create-or-join')}
          </a>
        )}
      </div>
    </main>
  );
}
