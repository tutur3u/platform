'use client';

import { ArrowRight, LogOut } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function LogoutPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthenticated(!!user);
      setLoading(false);

      // If not authenticated, go to login
      if (!user) {
        router.push('/login');
      }
    }
    checkAuth();
  }, [supabase.auth, router]);

  const handleLogoutAll = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut({ scope: 'local' });
    router.push('/login');
    router.refresh();
  };

  const handleGoToDashboard = () => {
    router.push('/');
    router.refresh();
  };

  if (loading || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingIndicator />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-linear-to-br from-background via-dynamic-indigo/5 to-dynamic-purple/10" />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <TuturuuLogo width={80} height={80} />
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
                variant="destructive"
                className="w-full"
                onClick={handleLogoutAll}
                disabled={loggingOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {loggingOut
                  ? t('common.loading')
                  : t('logout.logout-of-tuturuuu')}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoToDashboard}
                disabled={loggingOut}
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
