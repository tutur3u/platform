'use client';

import { updateMeetCallTitle } from '@tuturuuu/internal-api';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * The meeting title as an inline field for the host, so a new meeting can be
 * named before anyone joins. It saves when the field loses focus or Enter is
 * pressed, and a failed save puts the saved title back.
 */
export function PrejoinTitle({
  meetingId,
  title,
  onSaved,
}: {
  meetingId: string;
  title: string;
  onSaved: (title: string) => void;
}) {
  const t = useTranslations('meet.call');
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = draft ?? title;
  const save = async () => {
    const next = value.trim();
    if (busy || draft === null) return;
    if (!next || next === title) {
      setDraft(null);
      return;
    }
    setBusy(true);
    try {
      const result = await updateMeetCallTitle(meetingId, next);
      onSaved(result.name);
    } catch {
      toast.error(t('title_save_failed'));
    } finally {
      setDraft(null);
      setBusy(false);
    }
  };
  return (
    <Input
      aria-label={t('meeting_title')}
      className="-mx-3 h-auto w-auto bg-transparent px-3 py-1 font-semibold text-xl tracking-tight shadow-none [--field-stroke:transparent] hover:bg-muted/60 hover:[--field-stroke:var(--border)] focus-visible:bg-background focus-visible:[--field-stroke:var(--border)] md:text-xl"
      disabled={busy}
      id="prejoin-title"
      maxLength={255}
      onBlur={() => void save()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') setDraft(null);
      }}
      value={value}
    />
  );
}
