'use client';

import { Loader2, Search } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { isRetryableLookupError } from './citation-draft';
import type { LookupState } from './citation-state';

export function CitationLookupForm({
  lookup,
  onLookup,
  onApplyStale,
  onDismiss,
  onManualEntry,
}: {
  lookup: LookupState;
  onLookup: (input: string) => void;
  onApplyStale: () => void;
  onDismiss: () => void;
  onManualEntry: () => void;
}) {
  const t = useTranslations('cite.lookup');
  // Kept across failures so people can correct and retry the same input.
  const [input, setInput] = useState('');
  const loading = lookup.kind === 'loading';
  const trimmed = input.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed && !loading) onLookup(trimmed);
  };

  return (
    <section aria-labelledby="cite-lookup-label" className="space-y-3">
      <form className="space-y-2" onSubmit={submit}>
        <Label htmlFor="cite-lookup-input" id="cite-lookup-label">
          {t('label')}
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-describedby="cite-lookup-status"
            autoComplete="off"
            className="sm:flex-1"
            id="cite-lookup-input"
            maxLength={2048}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('placeholder')}
            spellCheck={false}
            value={input}
          />
          <Button
            aria-busy={loading}
            disabled={!trimmed || loading}
            type="submit"
          >
            {loading ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Search />
            )}
            {t('submit')}
            {loading ? <span className="sr-only">{t('loading')}</span> : null}
          </Button>
        </div>
      </form>

      <div aria-live="polite" id="cite-lookup-status">
        <LookupMessage
          lookup={lookup}
          onApplyStale={onApplyStale}
          onDismiss={onDismiss}
          onManualEntry={onManualEntry}
          onRetry={() => trimmed && onLookup(trimmed)}
        />
      </div>
    </section>
  );
}

function LookupMessage({
  lookup,
  onApplyStale,
  onDismiss,
  onManualEntry,
  onRetry,
}: {
  lookup: LookupState;
  onApplyStale: () => void;
  onDismiss: () => void;
  onManualEntry: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('cite.lookup');

  switch (lookup.kind) {
    case 'idle':
      return (
        <Button
          className="h-auto px-0"
          onClick={onManualEntry}
          type="button"
          variant="link"
        >
          {t('manual_entry')}
        </Button>
      );
    case 'loading':
      return <span className="sr-only">{t('loading')}</span>;
    case 'review':
      return <Notice>{t('review')}</Notice>;
    case 'manual':
      return <Notice>{t('manual')}</Notice>;
    case 'stale':
      return (
        <Notice>
          <span>{t('stale')}</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <Button onClick={onApplyStale} size="sm" type="button">
              {t('stale_apply')}
            </Button>
            <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
              {t('dismiss')}
            </Button>
          </span>
        </Notice>
      );
    case 'error':
      return (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2">
            <span className="block">{t(`errors.${lookup.code}`)}</span>
            <span className="flex flex-wrap gap-2">
              {isRetryableLookupError(lookup.code) ? (
                <Button
                  onClick={onRetry}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t('retry')}
                </Button>
              ) : null}
              <Button onClick={onManualEntry} size="sm" type="button">
                {t('manual_entry')}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      );
    default: {
      const unreachable: never = lookup;
      return unreachable;
    }
  }
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-col rounded-md border border-border bg-muted px-3 py-2.5 text-sm">
      {children}
    </p>
  );
}
