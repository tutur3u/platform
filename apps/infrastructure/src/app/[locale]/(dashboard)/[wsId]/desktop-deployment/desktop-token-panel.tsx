'use client';

import type {
  DesktopVaultMutation,
  DesktopVaultState,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function DesktopTokenPanel({
  state,
  pending,
  token,
  clearToken,
  act,
}: {
  state: DesktopVaultState;
  pending: boolean;
  token: string | null;
  clearToken: () => void;
  act: (input: DesktopVaultMutation) => Promise<void>;
}) {
  const t = useTranslations('desktop-deployment.vault');
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  return (
    <Card role="region" aria-label={t('tokens')}>
      <CardHeader>
        <CardTitle>{t('tokens')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t('tokenScope')}</p>
        <div className="flex flex-wrap gap-2">
          {state.versions
            .filter((version) => version.status === 'active')
            .map((version) => (
              <Button
                key={version.id}
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setRevealed(false);
                  void act({
                    action: 'create_token',
                    versionId: version.id,
                    expiresAt: new Date(
                      Date.now() + 7 * 86400000
                    ).toISOString(),
                  }).catch(() => {});
                }}
              >
                {t('issueToken', {
                  platform: t(`platforms.${version.platform}`),
                })}
              </Button>
            ))}
        </div>
        {token && (
          <section
            className="space-y-2 rounded-lg border p-3"
            aria-label={t('newToken')}
          >
            <Label htmlFor={id}>{t('newToken')}</Label>
            <Input
              id={id}
              value={token}
              type={revealed ? 'text' : 'password'}
              readOnly
              autoComplete="off"
            />
            <p className="text-muted-foreground text-sm">{t('tokenOnce')}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setRevealed(!revealed)}
              >
                {t(revealed ? 'conceal' : 'reveal')}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  clearToken();
                  setRevealed(false);
                }}
              >
                {t('dismissToken')}
              </Button>
            </div>
          </section>
        )}
        {state.tokens.length ? (
          <ul className="divide-y">
            {state.tokens.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="space-y-1">
                  <p>
                    {t(`platforms.${entry.platform}`)}{' '}
                    <code className="break-all">{entry.prefix}</code>
                  </p>
                  <p className="text-muted-foreground">
                    {t(entry.revokedAt ? 'revokedToken' : 'tokenExpires', {
                      date: new Date(entry.expiresAt).toLocaleString(),
                    })}
                  </p>
                </div>
                {!entry.revokedAt && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      void act({
                        action: 'revoke_token',
                        tokenId: entry.id,
                      }).catch(() => {});
                    }}
                  >
                    {t('revokeToken')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noTokens')}</p>
        )}
      </CardContent>
    </Card>
  );
}
