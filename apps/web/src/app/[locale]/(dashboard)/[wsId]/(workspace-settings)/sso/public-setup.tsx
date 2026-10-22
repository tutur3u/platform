'use client';
import type { SsoClientDetail } from '@tuturuuu/internal-api/sso';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function CopyValue({ label, value }: { label: string; value: string }) {
  const t = useTranslations('workspace-sso');
  const id = useId();
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        readOnly
        rows={value.includes('\n') ? 5 : 2}
        className="font-mono text-xs"
      />
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus('copied');
          } catch {
            setStatus('error');
          }
        }}
        aria-label={t('copyNamed', { name: label })}
      >
        {t('copy')}
      </Button>
      <span role="status" className="ml-2 text-sm">
        {status === 'copied'
          ? t('copied')
          : status === 'error'
            ? t('copyError')
            : ''}
      </span>
    </div>
  );
}
export function PublicSetup({ detail }: { detail: SsoClientDetail }) {
  const t = useTranslations('workspace-sso');
  return (
    <>
      <section
        className="space-y-4 rounded-lg border p-4"
        aria-labelledby="sso-setup"
      >
        <h2 id="sso-setup" className="font-semibold">
          {t('setup')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('setupInstructions')}
        </p>
        {!detail.pilotSelected && <p role="status">{t('notPilot')}</p>}
        {detail.setup ? (
          (['metadataUrl', 'entityId', 'ssoUrl'] as const).map((field) => (
            <CopyValue
              key={field}
              label={t(`setupFields.${field}`)}
              value={detail.setup?.[field] ?? ''}
            />
          ))
        ) : (
          <p>{t('originMissing')}</p>
        )}
        <CopyValue label={t('instructions')} value={t('setupInstructions')} />
      </section>
      <section className="space-y-3" aria-labelledby="sso-keys">
        <h2 id="sso-keys" className="font-semibold">
          {t('keys')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('keysHelp')}</p>
        {detail.keys.length === 0 && <p>{t('noKeys')}</p>}
        {detail.keys.map((key) => (
          <article key={key.kid} className="space-y-2 rounded-lg border p-4">
            <h3 className="font-medium">
              {key.kid} · {t(`keyStatus.${key.status}`)}
            </h3>
            <dl className="text-sm">
              {(
                [
                  'notBefore',
                  'notAfter',
                  'createdAt',
                  'activatedAt',
                  'retiredAt',
                  'revokedAt',
                ] as const
              ).map((field) => (
                <div key={field} className="flex flex-wrap gap-2">
                  <dt>{t(`keyDates.${field}`)}</dt>
                  <dd>{key[field] ?? t('notSet')}</dd>
                </div>
              ))}
            </dl>
            <CopyValue
              label={t('publicCertificate')}
              value={key.publicCertificate}
            />
          </article>
        ))}
      </section>
    </>
  );
}
