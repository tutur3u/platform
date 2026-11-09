'use client';

import { confirmEmailAppeal } from '@tuturuuu/internal-api/email-appeals';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

type ConfirmationState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'confirmed' }
  | { kind: 'unavailable' }
  | { kind: 'invalid' };

export default function EmailAppealConfirmation() {
  const t = useTranslations('email-appeals');
  const [state, setState] = useState<ConfirmationState>({ kind: 'idle' });
  const token = useRef<string | null>(null);

  async function confirm() {
    if (state.kind === 'pending' || state.kind === 'confirmed') return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    token.current ??= fragment.get('token');
    window.history.replaceState(null, '', window.location.pathname);
    if (!token.current || token.current.length > 2048) {
      setState({ kind: 'invalid' });
      return;
    }
    setState({ kind: 'pending' });
    try {
      const result = await confirmEmailAppeal(token.current);
      setState({ kind: result.status });
      if (result.status === 'confirmed') token.current = null;
    } catch {
      setState({ kind: 'invalid' });
      token.current = null;
    }
  }

  function content() {
    switch (state.kind) {
      case 'idle':
        return <Button onClick={confirm}>{t('confirm_button')}</Button>;
      case 'pending':
        return <p role="status">{t('confirming')}</p>;
      case 'confirmed':
        return <p role="status">{t('confirmed')}</p>;
      case 'unavailable':
        return <p role="alert">{t('confirm_unavailable')}</p>;
      case 'invalid':
        return <p role="alert">{t('invalid_token')}</p>;
      default: {
        const exhaustive: never = state;
        return exhaustive;
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <h1 className="font-semibold text-2xl tracking-tight">
        {t('confirm_title')}
      </h1>
      <p className="text-muted-foreground">{t('confirm_description')}</p>
      {content()}
    </main>
  );
}
