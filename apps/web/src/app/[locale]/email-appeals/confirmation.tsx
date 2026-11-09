'use client';

import {
  confirmEmailAppeal,
  previewEmailAppeal,
} from '@tuturuuu/internal-api/email-appeals';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

type WorkspaceDetails = { workspaceName: string; email: string };
type ConfirmationState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; details: WorkspaceDetails }
  | { kind: 'pending'; details: WorkspaceDetails }
  | { kind: 'confirmed' }
  | { kind: 'transport_pending' }
  | { kind: 'unavailable' }
  | { kind: 'invalid' };

export default function EmailAppealConfirmation() {
  const t = useTranslations('email-appeals');
  const [state, setState] = useState<ConfirmationState>({ kind: 'idle' });
  const token = useRef<string | null>(null);

  async function preview() {
    if (state.kind !== 'idle') return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    token.current = fragment.get('token');
    window.history.replaceState(null, '', window.location.pathname);
    if (!token.current || token.current.length > 2048) {
      setState({ kind: 'invalid' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const details = await previewEmailAppeal(token.current);
      setState({ kind: 'ready', details });
    } catch {
      setState({ kind: 'invalid' });
      token.current = null;
    }
  }

  async function confirm() {
    if (state.kind !== 'ready' || !token.current) return;
    setState({ kind: 'pending', details: state.details });
    try {
      const result = await confirmEmailAppeal(token.current);
      setState({ kind: result.status });
      token.current = null;
    } catch {
      setState({ kind: 'unavailable' });
      token.current = null;
    }
  }

  function content() {
    switch (state.kind) {
      case 'idle':
        return <Button onClick={preview}>{t('review_request')}</Button>;
      case 'loading':
        return <p role="status">{t('loading')}</p>;
      case 'ready':
      case 'pending':
        return (
          <div className="space-y-4">
            <dl className="space-y-3 rounded-xl border bg-card p-4">
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t('workspace')}
                </dt>
                <dd className="break-words font-medium">
                  {state.details.workspaceName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t('recipient')}
                </dt>
                <dd className="break-all">{state.details.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t('purpose')}
                </dt>
                <dd>{t('purpose_workspace_reports')}</dd>
              </div>
            </dl>
            <p>{t('confirm_description')}</p>
            <Button onClick={confirm} disabled={state.kind === 'pending'}>
              {t('confirm_button')}
            </Button>
            {state.kind === 'pending' ? (
              <p role="status">{t('confirming')}</p>
            ) : null}
          </div>
        );
      case 'confirmed':
        return <p role="status">{t('confirmed')}</p>;
      case 'transport_pending':
        return <p role="status">{t('transport_pending')}</p>;
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
      {content()}
    </main>
  );
}
