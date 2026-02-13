'use client';

import { AlertTriangle, ArrowRight, Trash2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function DeleteAccountPage() {
  const t = useTranslations('settings-account');
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthenticated(!!user);
      setLoading(false);

      if (!user) {
        router.push('/login?nextUrl=/account/delete');
      }
    }
    checkAuth();
  }, [supabase.auth, router]);

  const handleDelete = async () => {
    if (!email.trim()) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/v1/users/me/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 400 && data.message?.includes('does not match')) {
          toast.error(t('delete-account-email-mismatch'));
        } else {
          toast.error(t('delete-account-error'));
        }
        setDeleting(false);
        return;
      }

      toast.success(t('delete-account-success'));
      await supabase.auth.signOut({ scope: 'local' });
      router.push('/login');
      router.refresh();
    } catch {
      toast.error(t('delete-account-error'));
      setDeleting(false);
    }
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
      <div className="fixed inset-0 bg-linear-to-br from-background via-dynamic-red/5 to-dynamic-orange/10" />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <TuturuuLogo width={80} height={80} />
          </div>

          <Card className="border-dynamic-red/20 bg-card/80 shadow-2xl backdrop-blur-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-dynamic-red text-xl">
                {t('delete-account-page-title')}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {t('delete-account-warning')}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Warning banner */}
              <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
                  <div className="space-y-2">
                    <p className="font-medium text-dynamic-red text-sm">
                      {t('delete-account-data-warning')}
                    </p>
                    <ul className="space-y-1 text-dynamic-red text-sm">
                      <li>• {t('delete-account-data-profile')}</li>
                      <li>• {t('delete-account-data-workspaces')}</li>
                      <li>• {t('delete-account-data-chats')}</li>
                      <li>• {t('delete-account-data-settings')}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Email confirmation input */}
              <div className="space-y-2">
                <Label htmlFor="confirm-email" className="text-sm">
                  {t('delete-account-confirm-email')}
                </Label>
                <Input
                  id="confirm-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('email-address')}
                  disabled={deleting}
                  autoComplete="email"
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleDelete}
                  disabled={deleting || !email.trim()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleting
                    ? t('delete-account-deleting')
                    : t('delete-account-button')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGoToDashboard}
                  disabled={deleting}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {t('cancel')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
