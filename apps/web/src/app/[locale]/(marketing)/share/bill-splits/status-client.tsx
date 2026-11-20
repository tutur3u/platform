'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import {
  resolveTurnstileClientState,
  SAFARI_SAFE_TURNSTILE_OPTIONS,
} from '@tuturuuu/cloudflare/turnstile/client';
import { checkPublicBillSplitStatus } from '@tuturuuu/internal-api/finance-bill-splits';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

type Status = Awaited<ReturnType<typeof checkPublicBillSplitStatus>>;
type View = Status | { kind: 'idle' | 'loading' };

export function BillSplitStatusClient() {
  const t = useTranslations('bill-splits');
  const locale = useLocale();
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [challenge, setChallenge] = useState<string>();
  const turnstile = resolveTurnstileClientState({
    requireInDevWhenConfigured: true,
  });

  async function check() {
    setView({ kind: 'loading' });
    const token =
      new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    try {
      setView(await checkPublicBillSplitStatus(token, challenge));
    } catch {
      setView({ kind: 'unavailable' });
    } finally {
      setChallenge(undefined);
    }
  }

  function amount(
    minor: string,
    currency: { code: string; minorDigits: number }
  ) {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: currency.minorDigits,
      maximumFractionDigits: currency.minorDigits,
    });
    const boundary = minor.length - currency.minorDigits;
    const integer = BigInt(boundary > 0 ? minor.slice(0, boundary) : '0');
    if (currency.minorDigits === 0) return formatter.format(integer);
    const fraction = minor
      .slice(Math.max(0, boundary))
      .padStart(currency.minorDigits, '0');
    const digits = new Intl.NumberFormat(locale, { useGrouping: false });
    const localized = [...fraction]
      .map((digit) => digits.format(Number(digit)))
      .join('');
    return formatter
      .formatToParts(integer)
      .map((part) => (part.type === 'fraction' ? localized : part.value))
      .join('');
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 p-6">
      <h1 className="font-semibold text-2xl tracking-tight">
        {t('settlement')}
      </h1>
      {view.kind === 'ready' ? (
        <section
          className="space-y-3 rounded-xl border bg-card p-4"
          aria-live="polite"
        >
          {view.status.receivingQr && (
            <div className="w-fit rounded-md bg-white p-2">
              <QRCodeSVG
                value={view.status.receivingQr}
                title={t('receiving-qr')}
                size={176}
                marginSize={4}
              />
            </div>
          )}
          {view.status.name && (
            <h2 className="font-medium">{view.status.name}</h2>
          )}
          <p>
            {t(view.status.status === 'settled' ? 'settled' : 'outstanding', {
              count: view.status.remainingTransfers,
            })}
          </p>
          {view.status.toPayMinor !== undefined && (
            <p>
              {t('remaining-to-pay', {
                amount: amount(view.status.toPayMinor, view.status.currency),
              })}
            </p>
          )}
          {view.status.toReceiveMinor !== undefined && (
            <p>
              {t('remaining-to-receive', {
                amount: amount(
                  view.status.toReceiveMinor,
                  view.status.currency
                ),
              })}
            </p>
          )}
        </section>
      ) : (
        <>
          {view.kind === 'unavailable' && (
            <p role="alert" className="text-muted-foreground">
              {t('status-unavailable')}
            </p>
          )}
          {view.kind === 'challenge' &&
            (turnstile.canRenderWidget && turnstile.siteKey ? (
              <Turnstile
                options={{
                  ...SAFARI_SAFE_TURNSTILE_OPTIONS,
                  action: 'bill-split-status',
                }}
                siteKey={turnstile.siteKey}
                onSuccess={setChallenge}
                onExpire={() => setChallenge(undefined)}
                onError={() => setView({ kind: 'unavailable' })}
              />
            ) : (
              <p role="alert">{t('status-unavailable')}</p>
            ))}
          <Button
            onClick={check}
            disabled={
              view.kind === 'loading' ||
              (view.kind === 'challenge' && !challenge)
            }
          >
            {t(view.kind === 'loading' ? 'working' : 'check-settlement')}
          </Button>
        </>
      )}
    </main>
  );
}
