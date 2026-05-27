'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { OneTimeSecret } from './ai-agents-utils';

export function SecretPanel({
  secret,
  setSecret,
}: {
  secret: OneTimeSecret;
  setSecret: (secret: OneTimeSecret) => void;
}) {
  const t = useTranslations('ai-agents-settings');

  if (!secret) return null;

  return (
    <div className="space-y-3 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-4">
      <div>
        <h2 className="font-semibold text-base">{t('secret.title')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('secret.description', {
            channelId: secret.channelId,
            name: secret.name,
          })}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t('secret.value_label')}
          className="font-mono text-sm"
          readOnly
          value={secret.value}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(secret.value);
            toast.success(t('messages.copy_success'));
          }}
        >
          {t('actions.copy')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setSecret(null)}>
          {t('actions.dismiss')}
        </Button>
      </div>
    </div>
  );
}
