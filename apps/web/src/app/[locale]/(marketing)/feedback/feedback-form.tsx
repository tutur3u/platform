'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useMutation } from '@tanstack/react-query';
import {
  getProductFeedbackReceipt,
  submitProductFeedback,
} from '@tuturuuu/internal-api/product-feedback';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  categories,
  FeedbackSubmission,
  type FeedbackDraft,
  type SubmissionState,
} from './submission';

export function FeedbackForm({ siteKey }: { siteKey?: string }) {
  const t = useTranslations('productFeedback');
  const [draft, setDraft] = useState<FeedbackDraft>({
    category: 'feedback',
    title: '',
    details: '',
  });
  const [token, setToken] = useState('');
  const [state, setState] = useState<SubmissionState>({ kind: 'editing' });
  const widget = useRef<TurnstileInstance>(null);
  const [submission] = useState(
    () =>
      new FeedbackSubmission({
        send: submitProductFeedback,
        read: getProductFeedbackReceipt,
        key: () => crypto.randomUUID(),
        now: () => Date.now(),
        changed: setState,
      })
  );
  const submit = useMutation({
    mutationFn: () => submission.submit(draft, token),
    retry: false,
    onSettled: () => {
      setToken('');
      widget.current?.reset();
    },
  });
  const check = useMutation({
    mutationFn: () => submission.check(),
    retry: false,
  });
  const busy = state.kind === 'sending' || state.kind === 'checking';
  const locked = !['editing', 'error'].includes(state.kind);
  const sendable = ['editing', 'error', 'retry'].includes(state.kind);

  if (!siteKey) return <p role="alert">{t('unavailable')}</p>;
  if (state.kind === 'success') {
    return (
      <section className="space-y-3" role="status">
        <h2 className="font-semibold text-lg">{t('success')}</h2>
        <p className="text-muted-foreground">{t('stored')}</p>
        <p className="break-all font-mono text-sm">{state.receipt.id}</p>
      </section>
    );
  }
  if (state.kind === 'denied') {
    return (
      <div className="space-y-4">
        <p role="alert">{t(state.code)}</p>
        {state.code === 'login' && (
          <Button asChild>
            <Link href="/login?returnUrl=%2Ffeedback">{t('signIn')}</Link>
          </Button>
        )}
      </div>
    );
  }
  return (
    <form
      className="space-y-6"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (sendable && token) submit.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="feedback-category">{t('category')}</Label>
        <Select
          value={draft.category}
          disabled={locked}
          onValueChange={(value) => {
            const category = categories.find((item) => item === value);
            if (category) setDraft({ ...draft, category });
          }}
        >
          <SelectTrigger id="feedback-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {t(category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="feedback-title">{t('title')}</Label>
        <Input
          id="feedback-title"
          required
          maxLength={160}
          disabled={locked}
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="feedback-details">{t('details')}</Label>
        <Textarea
          id="feedback-details"
          required
          maxLength={7900}
          rows={8}
          disabled={locked}
          value={draft.details}
          onChange={(event) =>
            setDraft({ ...draft, details: event.target.value })
          }
        />
      </div>
      {state.kind === 'error' && <p role="alert">{t(state.code)}</p>}
      {(state.kind === 'uncertain' || state.kind === 'checking') && (
        <div className="space-y-3">
          <p role="alert">{t('uncertain')}</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => check.mutate()}
          >
            {t(busy ? 'checking' : 'check')}
          </Button>
        </div>
      )}
      {state.kind === 'retry' && <p role="status">{t('retry')}</p>}
      {sendable && (
        <Turnstile
          ref={widget}
          siteKey={siteKey}
          onSuccess={setToken}
          onExpire={() => setToken('')}
          onError={() => setToken('')}
          onTimeout={() => setToken('')}
        />
      )}
      <Button type="submit" disabled={!sendable || !token || busy}>
        {t(state.kind === 'sending' ? 'sending' : 'send')}
      </Button>
    </form>
  );
}
