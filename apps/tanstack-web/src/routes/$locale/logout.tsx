import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight, LogOut } from '@tuturuuu/icons/lucide';
import { logoutBrowserSessionWithInternalApi } from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TuturuuLogo,
} from '@tuturuuu/ui/custom/tuturuuu-logo';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '../../lib/platform/auth-gate';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

type LogoutSearch = {
  from: string | null;
};

export const Route = createFileRoute('/$locale/logout')({
  component: LogoutRoute,
  head: ({ params }) =>
    createPageHead({
      description: 'Log out of your Tuturuuu account.',
      locale: resolveMessagesLocale(params.locale),
      title: 'Log Out',
    }),
  loader: async ({ params }) => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.locale}/logout`,
    });
  },
  validateSearch: (search: Record<string, unknown>): LogoutSearch => ({
    from:
      typeof search.from === 'string' && search.from.trim()
        ? search.from
        : null,
  }),
});

function LogoutRoute() {
  const { locale } = Route.useParams();
  const { from } = Route.useSearch();
  const t = useTranslations();
  const [redirecting, setRedirecting] = useState(false);
  const loginHref = `/${locale}/login`;

  const logoutMutation = useMutation({
    mutationFn: () => logoutBrowserSessionWithInternalApi(),
    onSettled: () => {
      setRedirecting(true);
      window.location.assign(loginHref);
    },
  });

  const loggingOut = logoutMutation.isPending || redirecting;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="fixed inset-0 bg-linear-to-br from-background via-dynamic-indigo/5 to-dynamic-purple/10" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <TuturuuLogo height={80} src={TUTURUUU_LOCAL_LOGO_URL} width={80} />
          </div>

          <Card className="border-border/50 bg-card/80 shadow-2xl backdrop-blur-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">
                {from
                  ? t('logout.logged-out-from', { app: from })
                  : t('logout.confirm-title')}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {from
                  ? t('logout.also-logout-question')
                  : t('logout.description')}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                className="w-full"
                disabled={loggingOut}
                onClick={() => logoutMutation.mutate()}
                variant="destructive"
              >
                {loggingOut ? (
                  <LoadingIndicator className="mr-2 h-4 w-4" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                {loggingOut
                  ? t('common.loading')
                  : t('logout.logout-of-tuturuuu')}
              </Button>
              <Button
                className="w-full"
                disabled={loggingOut}
                onClick={() => {
                  window.location.assign(`/${locale}`);
                }}
                variant="outline"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                {t('logout.go-to-dashboard')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
