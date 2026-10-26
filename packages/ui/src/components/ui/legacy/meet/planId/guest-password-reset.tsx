'use client';

import { resetGuestPassword } from '@tuturuuu/apis/meet/actions';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function GuestPasswordReset({ planId }: { planId: string }) {
  const t = useTranslations('meet-together-plan-details');
  const id = useId();
  const [guestName, setGuestName] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<
    'success' | 'failed' | 'not-required' | null
  >(null);

  return (
    <form
      className="space-y-3 rounded-2xl border bg-background/80 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!guestName || !password || pending) return;
        setPending(true);
        setOutcome(null);
        try {
          const result = await resetGuestPassword(planId, guestName, password);
          setOutcome(
            result.data
              ? 'success'
              : result.error === 'RESET_NOT_REQUIRED'
                ? 'not-required'
                : 'failed'
          );
        } catch {
          setOutcome('failed');
        } finally {
          setPassword('');
          setPending(false);
        }
      }}
    >
      <h2 className="font-medium">{t('guest_password_reset_title')}</h2>
      <p className="text-muted-foreground text-sm">
        {t('guest_password_reset_description')}
      </p>
      <Label htmlFor={`${id}-guest`}>{t('guest_password_reset_guest')}</Label>
      <Input
        id={`${id}-guest`}
        value={guestName}
        onChange={(event) => setGuestName(event.target.value)}
        required
        maxLength={255}
        disabled={pending}
        autoComplete="off"
      />
      <Label htmlFor={`${id}-password`}>
        {t('guest_password_reset_new_password')}
      </Label>
      <Input
        id={`${id}-password`}
        type="password"
        autoComplete="new-password"
        required
        maxLength={1024}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
      />
      <Button type="submit" disabled={pending || !guestName || !password}>
        {t('guest_password_reset_title')}
      </Button>
      {outcome && (
        <p role="status" className="text-sm">
          {t(
            outcome === 'success'
              ? 'guest_password_reset_success'
              : outcome === 'not-required'
                ? 'guest_password_reset_not_required'
                : 'guest_password_reset_failed'
          )}
        </p>
      )}
    </form>
  );
}
