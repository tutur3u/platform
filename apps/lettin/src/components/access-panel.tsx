'use client';
import type { LettinOverview } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useLettinMutation } from './use-lettin';
export function AccessPanel({
  wsId,
  data,
}: {
  wsId: string;
  data: LettinOverview;
}) {
  const t = useTranslations('lettin');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const mutation = useLettinMutation(wsId);
  return (
    <details className="rounded-xl border border-border bg-card p-5">
      <summary className="cursor-pointer font-semibold">
        {t('creatorAccess')}
      </summary>
      <div className="mt-5 space-y-5">
        <p className="text-muted-foreground text-sm">{t('delegationHint')}</p>
        {data.canInvite && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await mutation.mutateAsync({ action: 'invite', email });
                setEmail('');
              } catch {}
            }}
          >
            <label className="min-w-0 flex-1 space-y-2">
              {t('email')}
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <Button disabled={mutation.isPending}>{t('invite')}</Button>
          </form>
        )}
        {data.invitations.map((invite) => (
          <div
            key={invite.id}
            className="space-y-2 rounded-lg border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="break-all">{invite.email}</span>
              <Button
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    action: 'revokeInvitation',
                    invitationId: invite.id,
                  })
                }
              >
                {t('revoke')}
              </Button>
            </div>
            <label className="block text-muted-foreground text-xs">
              {t('shareInvitation')}
              <Input
                readOnly
                value={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://lettin.tuturuuu.com'}/dashboard?invitation=${invite.id}`}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <p className="text-xs">
              {t('expires')}:{' '}
              {new Date(invite.expires_at).toLocaleDateString(locale, {
                timeZone: 'UTC',
              })}
            </p>
          </div>
        ))}
        {data.isAdmin && (
          <div className="space-y-3">
            <h2 className="text-xl">{t('creatorPermissions')}</h2>
            {data.creators.map((creator) => (
              <div
                key={creator.user_id}
                className="flex flex-wrap items-center gap-5 border-border border-t py-3"
              >
                <span className="mr-auto">
                  {creator.name || creator.user_id}
                </span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={creator.enabled}
                    disabled={mutation.isPending}
                    onChange={(e) =>
                      mutation.mutate({
                        action: 'setCreator',
                        userId: creator.user_id,
                        canInvite: creator.can_invite,
                        enabled: e.target.checked,
                      })
                    }
                  />
                  {t('enabled')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={creator.can_invite}
                    disabled={mutation.isPending}
                    onChange={(e) =>
                      mutation.mutate({
                        action: 'setCreator',
                        userId: creator.user_id,
                        enabled: creator.enabled,
                        canInvite: e.target.checked,
                      })
                    }
                  />
                  {t('canInvite')}
                </label>
              </div>
            ))}
          </div>
        )}
        {mutation.errorMessage && <p role="alert">{mutation.errorMessage}</p>}
      </div>
    </details>
  );
}
