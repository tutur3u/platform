import { AlertTriangle, ExternalLink, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { WEB_APP_URL } from '@/constants/common';

export default async function AuthErrorPage() {
  const t = await getTranslations('ai-studio');

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl border bg-muted">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <CardTitle>{t('auth-error')}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {t('auth-error-description')}
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/login?refresh=1">
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('auth-error-retry')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={WEB_APP_URL}>
              <ExternalLink className="size-4" aria-hidden="true" />
              {t('auth-error-platform')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
