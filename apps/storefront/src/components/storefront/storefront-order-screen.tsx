'use client';

import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { InventoryCheckoutSession } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { formatMoneyFromMinor } from '@tuturuuu/utils/money';
import { useTranslations } from 'next-intl';
import { ReturnToStoreButton } from './return-to-store-button';
import {
  formatStorefrontOrderStatus,
  getStorefrontOrderState,
} from './storefront-order-state';

function OrderStateIcon({
  state,
}: {
  state: ReturnType<typeof getStorefrontOrderState>;
}) {
  if (state === 'confirmed') return <CheckCircle2 className="size-8" />;
  if (state === 'needs_attention') return <TriangleAlert className="size-8" />;
  return <Loader2 className="size-8 animate-spin" />;
}

export function StorefrontOrderScreen({
  isUnavailable,
  onRetry,
  order,
  publicToken,
  storeSlug,
  withinSharedShell = false,
}: {
  isUnavailable: boolean;
  onRetry: () => void;
  order?: InventoryCheckoutSession;
  publicToken?: string;
  storeSlug: string;
  withinSharedShell?: boolean;
}) {
  const t = useTranslations('storefront');
  const state = getStorefrontOrderState(order);
  const stateTone =
    state === 'confirmed'
      ? 'border-primary/20 bg-primary/10 text-primary'
      : state === 'needs_attention'
        ? 'border-destructive/25 bg-destructive/10 text-destructive'
        : 'border-border bg-muted/50 text-foreground';
  const title =
    state === 'confirmed'
      ? t('orderConfirmed')
      : state === 'needs_attention'
        ? t('orderNeedsAttention')
        : t('orderPending');
  const description = !order
    ? t('loading')
    : state === 'confirmed'
      ? t('orderConfirmedDescription')
      : state === 'needs_attention'
        ? t('orderNeedsAttentionDescription')
        : order.checkoutProvider === 'square_terminal'
          ? t('squareOrderPlacedDescription')
          : order.checkoutProvider === 'square_pos'
            ? t('squarePosOrderPlacedDescription')
            : t('orderPlacedDescription');

  return (
    <main
      className={
        withinSharedShell
          ? 'mx-auto grid min-h-[calc(100dvh-4.3125rem)] w-full max-w-lg place-items-center p-2 sm:px-4 sm:py-10'
          : 'mx-auto grid min-h-dvh w-full max-w-lg place-items-center p-2 sm:px-4 sm:py-10'
      }
    >
      <section className="w-full overflow-hidden rounded-xl border border-border bg-card p-4 text-center sm:p-6">
        {isUnavailable ? (
          <>
            <p className="text-muted-foreground text-sm">{t('order')}</p>
            <h1 className="mt-2 break-all font-semibold text-xl sm:text-2xl">
              {publicToken}
            </h1>
            <div className="mt-5 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-left text-destructive">
              <p className="font-semibold">{t('orderErrorTitle')}</p>
              <p className="mt-1 text-sm opacity-80">
                {t('orderErrorDescription')}
              </p>
              <Button
                className="mt-4"
                onClick={onRetry}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw className="size-4" />
                {t('retry')}
              </Button>
            </div>
            <ReturnToStoreButton
              href={`/${storeSlug}`}
              label={t('backToStore')}
              pendingLabel={t('returningToStore')}
            />
          </>
        ) : (
          <>
            <div
              className="-mx-4 -mt-4 mb-5 h-1.5 sm:-mx-6 sm:-mt-6 sm:mb-6"
              style={{
                backgroundColor: 'var(--storefront-accent, var(--primary))',
              }}
            />
            <span
              className={`mx-auto grid size-16 place-items-center rounded-full border ring-8 ring-current/5 ${stateTone}`}
            >
              <OrderStateIcon state={state} />
            </span>
            <p className="mt-5 text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {t('order')}
            </p>
            <h1 className="mt-1 font-semibold text-2xl tracking-tight">
              {title}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-muted-foreground text-sm leading-6">
              {description}
            </p>
            {order ? (
              <span
                className={`mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-xs capitalize ${stateTone}`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {t('orderStatus', {
                  status: formatStorefrontOrderStatus(order),
                })}
              </span>
            ) : (
              <p className="mt-4 text-muted-foreground text-sm">
                {t('loading')}
              </p>
            )}
            {state === 'needs_attention' ? (
              <Button
                className="mt-4"
                onClick={onRetry}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw className="size-4" />
                {t('checkPaymentAgain')}
              </Button>
            ) : null}
            {order && order.lines.length > 0 ? (
              <div className="mt-5 rounded-xl border border-border bg-muted/10 p-3 text-left sm:p-4">
                <div className="grid gap-2">
                  {order.lines.map((line) => (
                    <div
                      className="flex items-baseline justify-between gap-3 text-sm"
                      key={line.id}
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground tabular-nums">
                          {line.quantity}×{' '}
                        </span>
                        {line.title}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
                        {formatMoneyFromMinor(
                          line.subtotalAmount,
                          order.currency
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-border border-t pt-3 text-sm">
                  <span className="text-muted-foreground">{t('total')}</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoneyFromMinor(order.totalAmount, order.currency)}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="mt-5 rounded-xl border border-border border-dashed bg-muted/20 p-3 text-left sm:p-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                {t('orderReference')}
              </p>
              <p className="mt-1 break-all font-mono text-sm">{publicToken}</p>
            </div>
            <ReturnToStoreButton
              href={`/${storeSlug}`}
              label={t('backToStore')}
              pendingLabel={t('returningToStore')}
            />
          </>
        )}
      </section>
    </main>
  );
}
