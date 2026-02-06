'use client';

import { AlertTriangle, Mail, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DEV_MODE } from '@/constants/common';
import type { SeatStatus } from '@/utils/seat-limits';
import PurchaseLink from './purchase-link';

interface NoSubscriptionFoundProps {
  wsId: string;
  error: string | null;
  seatStatus?: SeatStatus;
  targetProductId?: string | null;
}

const isDevelopment = DEV_MODE === true;

export function NoSubscriptionFound({
  wsId,
  error,
  seatStatus,
  targetProductId,
}: NoSubscriptionFoundProps) {
  const t = useTranslations('billing.no-subscription');
  const router = useRouter();

  const handleRetry = () => {
    router.refresh();
  };

  // Determine error message based on error type
  const getErrorDetails = () => {
    switch (error) {
      case 'SUBSCRIPTION_SYNC_TIMEOUT':
        return {
          code: 'SUB_SYNC_TIMEOUT',
          devDescription: isDevelopment
            ? 'Subscription created in Polar but webhook not processed within 5 seconds. This might indicate webhook configuration issues or slow network.'
            : undefined,
          prodDescription: t('prod.timeout-description'),
        };
      case 'SUBSCRIPTION_CREATE_FAILED':
        return {
          code: 'SUB_CREATE_FAILED',
          devDescription: isDevelopment
            ? 'Failed to create subscription via Polar API. Check Polar configuration and product setup.'
            : undefined,
          prodDescription: t('prod.description'),
        };
      case 'WORKSPACE_SUBSCRIPTION_REQUIRED':
        return {
          code: 'WORKSPACE_SUB_REQUIRED',
          devDescription: isDevelopment
            ? 'Non-personal workspaces require a manual checkout for the free seat-based plan. Automatic creation is disabled for these workspaces.'
            : undefined,
          prodDescription: t(
            'prod.workspace-subscription-required.description'
          ),
          title: t('prod.workspace-subscription-required.title'),
          actionLabel: t('prod.workspace-subscription-required.action'),
        };
      default:
        return {
          code: 'UNKNOWN_ERROR',
          devDescription: isDevelopment ? error : undefined,
          prodDescription: t('prod.description'),
        };
    }
  };

  const errorDetails = getErrorDetails();

  if (isDevelopment) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Card className="border-dynamic-orange">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-dynamic-orange" />
              <CardTitle>{t('dev.title')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-dynamic-foreground/80">{t('dev.description')}</p>

            {error && (
              <div className="rounded-lg bg-dynamic-red/10 p-4">
                <p className="font-mono text-dynamic-red text-sm">
                  Error Code: {errorDetails.code}
                </p>
                {errorDetails.devDescription && (
                  <p className="mt-2 text-dynamic-foreground/70 text-sm">
                    {errorDetails.devDescription}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4">
              {error === 'WORKSPACE_SUBSCRIPTION_REQUIRED' &&
              targetProductId ? (
                <div className="rounded-lg text-center">
                  <p className="mb-4 text-dynamic-foreground/80">
                    {errorDetails.prodDescription}
                  </p>
                  <PurchaseLink
                    subscriptionId={null}
                    productId={targetProductId}
                    wsId={wsId}
                    seats={seatStatus?.memberCount || 1}
                    className="w-full"
                  >
                    {errorDetails.actionLabel}
                  </PurchaseLink>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="mb-2 font-semibold">
                      {t('dev.polar-config.title')}
                    </h3>
                    <ul className="ml-6 list-disc space-y-1 text-dynamic-foreground/70 text-sm">
                      <li>{t('dev.polar-config.sandbox')}</li>
                      <li>{t('dev.polar-config.token')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold">
                      {t('dev.webhook-config.title')}
                    </h3>
                    <ul className="ml-6 list-disc space-y-1 text-dynamic-foreground/70 text-sm">
                      <li>
                        {t('dev.webhook-config.ngrok')}{' '}
                        <Link
                          href="https://ngrok.com/download"
                          className="text-blue-600 underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          https://ngrok.com/download
                        </Link>
                      </li>
                      <li>{t('dev.webhook-config.url')}</li>
                      <li>{t('dev.webhook-config.secret')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold">
                      {t('dev.reload.title')}
                    </h3>
                    <p className="text-dynamic-foreground/70 text-sm">
                      {t('dev.reload.description')}
                    </p>
                  </div>
                </>
              )}
            </div>

            <Button variant="outline" onClick={handleRetry} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Production mode
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Card className="border-dynamic-red">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-dynamic-red" />
            <CardTitle>{t('prod.title')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-dynamic-foreground/80">
            {errorDetails.prodDescription}
          </p>

          <div className="space-y-2 rounded-lg bg-dynamic-surface p-4">
            <div className="flex justify-between text-sm">
              <span className="text-dynamic-foreground/60">
                {t('prod.error-code')}:
              </span>
              <span className="font-mono">{error}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dynamic-foreground/60">
                {t('prod.workspace-id')}:
              </span>
              <span className="font-mono">{wsId}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {error === 'WORKSPACE_SUBSCRIPTION_REQUIRED' && targetProductId && (
              <PurchaseLink
                subscriptionId={null}
                productId={targetProductId}
                wsId={wsId}
                seats={seatStatus?.memberCount || 1}
                className="w-full"
              >
                {errorDetails.actionLabel}
              </PurchaseLink>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleRetry}
                variant="outline"
                className="flex-1"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('retry')}
              </Button>
              <Button asChild className="flex-1" variant="ghost">
                <Link
                  href="mailto:support@tuturuuu.com"
                  rel="noopener noreferrer"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {t('contact-support')}
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
