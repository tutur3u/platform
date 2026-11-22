'use client';

import { Check, Copy } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

const STEP_COUNT = 3;

/** A 3-segment step bar; the label carries the position for assistive tech. */
export function EnrollmentStepBar({ current }: { current: 1 | 2 | 3 }) {
  const t = useTranslations('login');
  return (
    <div
      aria-label={t('required_mfa_step', {
        current,
        total: STEP_COUNT,
      })}
      className="flex gap-1.5"
      role="img"
    >
      {Array.from({ length: STEP_COUNT }).map((_, index) => (
        <span
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors motion-reduce:transition-none',
            index < current ? 'bg-primary' : 'bg-muted'
          )}
          key={`enrollment-step-${index + 1}`}
        />
      ))}
    </div>
  );
}

/** Groups a setup key in fours so it can be read and typed. */
export function groupSetupKey(secret: string) {
  return (
    secret
      .replace(/\s+/gu, '')
      .match(/.{1,4}/gu)
      ?.join(' ') ?? ''
  );
}

/**
 * The otpauth URI the authenticator reads. The provider's own URI is used
 * as is; a bare secret falls back to a minimal TOTP URI. Nothing leaves the
 * browser: the QR is drawn locally and the value is never stored or logged.
 */
export function setupQrValue(totp: { secret: string; uri?: string | null }) {
  if (totp.uri?.startsWith('otpauth://')) return totp.uri;
  const params = new URLSearchParams({
    issuer: 'Tuturuuu',
    secret: totp.secret,
  });
  return `otpauth://totp/Tuturuuu?${params.toString()}`;
}

/**
 * The QR beside "Can't scan? Enter this key", the grouped key and Copy key.
 * The QR keeps its own light ground so cameras can read it in dark mode.
 */
export function EnrollmentSetupKey({
  secret,
  uri,
}: {
  secret: string;
  uri?: string | null;
}) {
  const t = useTranslations('login');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the key stays visible to type.
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div
        aria-label={t('required_mfa_qr_label')}
        className="shrink-0 overflow-hidden rounded-2xl border"
        data-testid="required-mfa-qr"
        role="img"
      >
        <QRCodeSVG
          aria-hidden="true"
          level="M"
          marginSize={2}
          size={132}
          value={setupQrValue({ secret, uri })}
        />
      </div>
      <div className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
        <span className="text-muted-foreground text-sm">
          {t('required_mfa_cant_scan')}
        </span>
        <code
          className="select-all break-all font-mono font-semibold text-sm tracking-wide"
          data-testid="required-mfa-secret"
        >
          {groupSetupKey(secret)}
        </code>
        <p className="sr-only">{t('required_mfa_secret_label')}</p>
        <Button
          className="h-11 rounded-full px-4"
          onClick={() => void copy()}
          type="button"
          variant="outline"
        >
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copied ? t('required_mfa_key_copied') : t('required_mfa_copy_key')}
        </Button>
      </div>
    </div>
  );
}
