import { Languages, LogOut } from '@tuturuuu/icons';
import {
  getTeachBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { TeachThemeControl } from '@/components/teach-theme-control';
import { Link, redirect } from '@/i18n/navigation';

export default async function TeachSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { locale, wsId } = await params;
  const t = await getTranslations('teachSettings');
  const requestHeaders = await headers();
  const bootstrap = await getTeachBootstrap(
    withForwardedInternalApiAuth(requestHeaders)
  ).catch(() => null);

  if (!bootstrap)
    return redirect({ href: `/login?next=/${wsId}/settings`, locale });
  const workspace = bootstrap.workspaces.find(
    (candidate) => candidate.id === wsId
  );
  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    return redirect({
      href: fallbackId ? `/${fallbackId}` : '/dashboard',
      locale,
    });
  }

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-lg border border-border bg-background p-6 md:p-8">
          <Link
            className="mb-5 inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 font-bold text-sm"
            href={`/${wsId}`}
          >
            {t('backToDashboard')}
          </Link>
          <h1 className="font-semibold text-3xl leading-tight md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {workspace.name ?? t('workspaceFallback')}
          </p>
        </header>
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold text-xl">{t('theme')}</h2>
            <div className="mt-4">
              <TeachThemeControl />
            </div>
          </article>
          <article className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold text-xl">{t('language')}</h2>
            <div className="mt-4 flex gap-2">
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 font-semibold text-xs"
                href={`/${wsId}/settings`}
                locale="en"
              >
                <Languages className="h-4 w-4" />
                English
              </Link>
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 font-semibold text-xs"
                href={`/${wsId}/settings`}
                locale="vi"
              >
                <Languages className="h-4 w-4" />
                Tiếng Việt
              </Link>
            </div>
          </article>
        </section>
        <a
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-primary px-4 font-semibold text-primary-foreground"
          href="/api/auth/logout"
        >
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </a>
      </div>
    </main>
  );
}
