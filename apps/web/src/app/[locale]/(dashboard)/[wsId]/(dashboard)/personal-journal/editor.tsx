'use client';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  createPersonalJournal,
  type JournalDocument,
  type JournalEntry,
  journalDocumentFromEntry,
  journalDocumentSchema,
  readPersonalJournal,
  updatePersonalJournal,
} from '@tuturuuu/internal-api/personal-journal';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  confirmJournalAttempt,
  type JournalAttempt,
  makeJournalAttempt,
} from './draft';
import JournalTimeline from './timeline';

type Props = {
  actorId: string;
  wsId: string;
  entry?: JournalEntry;
  timezone: string;
  onSaved: (entry: JournalEntry) => void;
  onBusy: (busy: boolean) => void;
};
export default function JournalEditor({
  actorId,
  wsId,
  entry,
  timezone,
  onSaved,
  onBusy,
}: Props) {
  const t = useTranslations('personal_journal');
  const [id] = useState(() => entry?.id ?? crypto.randomUUID());
  const [revision, setRevision] = useState(entry?.revision ?? 0);
  const [document, setDocument] = useState<JournalDocument>(() =>
    entry
      ? journalDocumentFromEntry(entry)
      : {
          title: '',
          body: '',
          occurredAt: new Date().toISOString(),
          timezone,
          mood: null,
          moodContext: '',
          domain: 'life',
          category: 'reflection',
        }
  );
  const [status, setStatus] = useState<
    'draft' | 'saving' | 'saved' | 'failed' | 'conflict'
  >(entry ? 'saved' : 'draft');
  const [dirty, setDirty] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<JournalEntry>();
  const [recoveryError, setRecoveryError] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef<JournalAttempt | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const locked =
    status === 'saving' || status === 'failed' || status === 'conflict';
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function save(next: JournalDocument, recovered = false) {
    if (inFlight.current) return;
    if (timer.current) clearTimeout(timer.current);
    const parsed = journalDocumentSchema.safeParse(next);
    if (!parsed.success || (status === 'conflict' && !recovered)) return;
    const operation =
      attempt.current ??
      makeJournalAttempt(parsed.data, id, crypto.randomUUID(), revision);
    attempt.current = operation;
    inFlight.current = true;
    setStatus('saving');
    onBusy(true);
    try {
      const receipt =
        operation.kind === 'create'
          ? await createPersonalJournal(wsId, operation.input)
          : await updatePersonalJournal(wsId, operation.id, operation.input);
      const saved = confirmJournalAttempt(operation, receipt, actorId, wsId);
      if (!alive.current) return;
      attempt.current = null;
      setRevision(saved.revision);
      setDocument(journalDocumentFromEntry(saved));
      setDirty(false);
      setStatus('saved');
      onBusy(false);
      onSaved(saved);
    } catch (error) {
      if (!alive.current) return;
      setStatus(
        error instanceof InternalApiError && error.status === 409
          ? 'conflict'
          : 'failed'
      );
    } finally {
      inFlight.current = false;
    }
  }
  async function compareCurrent() {
    setRecovering(true);
    setRecoveryError(false);
    try {
      const latest = await readPersonalJournal(wsId, id);
      if (latest.actorId !== actorId || latest.workspaceId !== wsId)
        throw new Error('Foreign journal source');
      if (alive.current) setCurrentEntry(latest);
    } catch {
      if (alive.current) setRecoveryError(true);
    } finally {
      if (alive.current) setRecovering(false);
    }
  }
  function saveComparedDraft() {
    if (!currentEntry || inFlight.current) return;
    attempt.current = makeJournalAttempt(
      document,
      id,
      crypto.randomUUID(),
      currentEntry.revision
    );
    setRevision(currentEntry.revision);
    setCurrentEntry(undefined);
    void save(document, true);
  }
  const invalidTime = !journalDocumentSchema.shape.occurredAt.safeParse(
    document.occurredAt
  ).success;
  const invalidZone = !journalDocumentSchema.shape.timezone.safeParse(
    document.timezone
  ).success;
  const invalidBody =
    dirty && !journalDocumentSchema.shape.body.safeParse(document.body).success;
  function change<K extends keyof JournalDocument>(
    key: K,
    value: JournalDocument[K]
  ) {
    if (locked) return;
    const next = { ...document, [key]: value };
    setDocument(next);
    setDirty(true);
    setStatus('draft');
    onBusy(true);
    if (timer.current) clearTimeout(timer.current);
    if (journalDocumentSchema.safeParse(next).success)
      timer.current = setTimeout(() => void save(next), 700);
  }
  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label={t('editor')}
    >
      <p className="text-muted-foreground text-sm">{t('privacy')}</p>
      <div>
        <Label htmlFor="journal-title">{t('entry_title')}</Label>
        <Input
          id="journal-title"
          maxLength={200}
          disabled={locked}
          value={document.title}
          onChange={(event) => change('title', event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="journal-body">{t('body')}</Label>
        <Textarea
          id="journal-body"
          maxLength={20000}
          rows={8}
          aria-invalid={invalidBody}
          aria-describedby={invalidBody ? 'journal-body-error' : undefined}
          disabled={locked}
          value={document.body}
          onChange={(event) => change('body', event.target.value)}
        />
        {invalidBody && (
          <p id="journal-body-error" role="alert">
            {t('body_error')}
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="journal-time">{t('occurred_at')}</Label>
          <Input
            id="journal-time"
            aria-invalid={invalidTime}
            aria-describedby={
              invalidTime ? 'journal-time-error' : 'journal-time-hint'
            }
            disabled={locked}
            value={document.occurredAt}
            onChange={(event) => change('occurredAt', event.target.value)}
          />
          <p id="journal-time-hint" className="text-muted-foreground text-xs">
            {t('utc_hint')}
          </p>
          {invalidTime && (
            <p id="journal-time-error" role="alert">
              {t('time_error')}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="journal-zone">{t('timezone')}</Label>
          <Input
            id="journal-zone"
            aria-invalid={invalidZone}
            aria-describedby={invalidZone ? 'journal-zone-error' : undefined}
            disabled={locked}
            value={document.timezone}
            onChange={(event) => change('timezone', event.target.value)}
          />
          {invalidZone && (
            <p id="journal-zone-error" role="alert">
              {t('invalid_timezone')}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="journal-domain">{t('domain')}</Label>
          <select
            id="journal-domain"
            className="w-full rounded border bg-background p-2"
            disabled={locked}
            value={document.domain}
            onChange={(event) =>
              change('domain', event.target.value === 'work' ? 'work' : 'life')
            }
          >
            <option value="life">{t('life')}</option>
            <option value="work">{t('work')}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="journal-category">{t('category')}</Label>
          <select
            id="journal-category"
            className="w-full rounded border bg-background p-2"
            disabled={locked}
            value={document.category}
            onChange={(event) => {
              const result = journalDocumentSchema.shape.category.safeParse(
                event.target.value
              );
              if (result.success) change('category', result.data);
            }}
          >
            {['reflection', 'good', 'challenge', 'milestone'].map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="journal-mood">{t('mood')}</Label>
        <select
          id="journal-mood"
          className="w-full rounded border bg-background p-2"
          disabled={locked}
          value={document.mood ?? ''}
          onChange={(event) => {
            const result = journalDocumentSchema.shape.mood.safeParse(
              event.target.value || null
            );
            if (result.success) change('mood', result.data);
          }}
        >
          <option value="">{t('no_mood')}</option>
          {['very_low', 'low', 'neutral', 'good', 'great'].map((value) => (
            <option key={value} value={value}>
              {t(`mood_${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="journal-context">{t('mood_context')}</Label>
        <Textarea
          id="journal-context"
          maxLength={2000}
          disabled={locked}
          value={document.moodContext}
          onChange={(event) => change('moodContext', event.target.value)}
        />
      </div>
      <output aria-live="polite" className="block">
        {t(status)}
      </output>
      {dirty && (
        <p className="text-muted-foreground text-sm">{t('draft_notice')}</p>
      )}
      {status === 'failed' && <p role="alert">{t('unknown_notice')}</p>}
      {status === 'conflict' && (
        <div className="space-y-3">
          <p role="alert">{t('conflict_notice')}</p>
          <Button
            variant="outline"
            disabled={recovering}
            onClick={() => void compareCurrent()}
          >
            {t('compare_current')}
          </Button>
          {recoveryError && <p role="alert">{t('load_error')}</p>}
          {currentEntry && (
            <section aria-label={t('current_revision')} className="space-y-3">
              <h3>{t('current_revision')}</h3>
              <JournalTimeline
                items={[currentEntry]}
                timezone={currentEntry.timezone}
                period="day"
                disabled
                onEdit={() => {}}
              />
              <Button onClick={saveComparedDraft}>
                {t('save_compared_draft')}
              </Button>
            </section>
          )}
        </div>
      )}
      <Button
        disabled={
          status === 'saving' ||
          status === 'conflict' ||
          !journalDocumentSchema.safeParse(document).success ||
          (!dirty && status === 'saved')
        }
        onClick={() => void save(document)}
      >
        {t(status === 'failed' ? 'retry' : 'save')}
      </Button>
    </section>
  );
}
