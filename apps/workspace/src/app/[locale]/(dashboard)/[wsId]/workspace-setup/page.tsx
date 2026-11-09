import { AlertTriangle } from '@tuturuuu/icons';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import { createCrossAppReturnUrlWithInternalApi } from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { resolveWorkspaceSetupReturnUrl } from './workspace-setup-return';

interface WorkspaceSetupPageProps {
  params: Promise<{ locale: string; wsId: string }>;
  searchParams: Promise<{ returnUrl?: string | string[] }>;
}

export default async function WorkspaceSetupPage({
  params,
  searchParams,
}: WorkspaceSetupPageProps) {
  await connection();

  const [{ locale, wsId }, query] = await Promise.all([params, searchParams]);
  const rawReturnUrl = Array.isArray(query.returnUrl)
    ? query.returnUrl[0]
    : query.returnUrl;
  const returnUrl = resolveWorkspaceSetupReturnUrl(rawReturnUrl, wsId);

  if (!returnUrl) {
    redirect(`/${locale}/${wsId}`);
  }

  let crossAppReturnUrl: string | null = null;

  try {
    const result = await createCrossAppReturnUrlWithInternalApi(
      { returnUrl: returnUrl.toString() },
      withForwardedInternalApiAuth(await headers())
    );

    if (result.returnUrl && result.targetApp) {
      crossAppReturnUrl = result.returnUrl;
    } else {
      console.warn('Failed to create satellite workspace return URL', {
        targetApp: result.targetApp ?? null,
        workspaceId: wsId,
      });
    }
  } catch (error) {
    console.error('Satellite workspace return failed', {
      error: error instanceof Error ? error.message : String(error),
      workspaceId: wsId,
    });
  }

  if (crossAppReturnUrl) {
    redirect(crossAppReturnUrl);
  }

  const t = await getTranslations('workspace-setup');
  const retryHref = `/${locale}/${wsId}/workspace-setup?${new URLSearchParams({
    returnUrl: returnUrl.toString(),
  }).toString()}`;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-dynamic-amber" />
            {t('return_failed_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t('return_failed_description')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={retryHref}>{t('retry')}</a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/${locale}/${wsId}`}>{t('continue_on_platform')}</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
