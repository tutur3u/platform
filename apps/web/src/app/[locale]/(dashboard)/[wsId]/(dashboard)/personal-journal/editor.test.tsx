import { act, fireEvent, render, screen } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { journalEntrySchema } from '@tuturuuu/internal-api/personal-journal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JournalEditor from './editor';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/personal-journal', async (original) => ({
  ...(await original<
    typeof import('@tuturuuu/internal-api/personal-journal')
  >()),
  createPersonalJournal: api.create,
  updatePersonalJournal: api.update,
  readPersonalJournal: api.read,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const actorId = '00000000-0000-4000-8000-000000000001',
  wsId = '00000000-0000-4000-8000-000000000002';
const entry = journalEntrySchema.parse({
  id: '00000000-0000-4000-8000-000000000003',
  actorId,
  workspaceId: wsId,
  title: 'Title',
  body: 'Original body',
  occurredAt: '2026-10-12T10:00:00.000Z',
  timezone: 'UTC',
  mood: 'good',
  moodContext: '',
  domain: 'life',
  category: 'reflection',
  revision: 1,
  createdAt: '2026-10-12T10:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
describe('journal editor acknowledgment', () => {
  it('autosaves original source and retries the same unknown operation once', async () => {
    const onSaved = vi.fn(),
      onBusy = vi.fn();
    api.update
      .mockRejectedValueOnce(new Error('Network outcome unknown'))
      .mockResolvedValueOnce({ ...entry, body: 'Changed words', revision: 2 });
    render(
      <JournalEditor
        actorId={actorId}
        wsId={wsId}
        entry={entry}
        timezone="UTC"
        onSaved={onSaved}
        onBusy={onBusy}
      />
    );
    fireEvent.change(screen.getByLabelText('body'), {
      target: { value: 'Changed words' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.getByText('failed')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    const originalAttempt = api.update.mock.calls[0];
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await act(async () => {});
    expect(api.update.mock.calls[1]).toEqual(originalAttempt);
    expect(onSaved).toHaveBeenCalledWith({
      ...entry,
      body: 'Changed words',
      revision: 2,
    });
    expect(screen.getByText('saved')).toBeTruthy();
  });
  it('preserves conflicting words and stops autosave retries', async () => {
    api.update.mockRejectedValue(new InternalApiError('Conflict', 409));
    render(
      <JournalEditor
        actorId={actorId}
        wsId={wsId}
        entry={entry}
        timezone="UTC"
        onSaved={vi.fn()}
        onBusy={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('body'), {
      target: { value: 'My conflicting words' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.getByText('conflict_notice')).toBeTruthy();
    expect(screen.getByLabelText('body')).toHaveValue('My conflicting words');
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it('compares current source and explicitly rebases preserved draft with a fresh CAS operation', async () => {
    api.update
      .mockRejectedValueOnce(new InternalApiError('Conflict', 409))
      .mockResolvedValueOnce({ ...entry, body: 'My words', revision: 3 });
    api.read.mockResolvedValue({
      ...entry,
      body: 'Other saved words',
      revision: 2,
    });
    const onSaved = vi.fn();
    render(
      <JournalEditor
        actorId={actorId}
        wsId={wsId}
        entry={entry}
        timezone="UTC"
        onSaved={onSaved}
        onBusy={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('body'), {
      target: { value: 'My words' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    fireEvent.click(screen.getByRole('button', { name: 'compare_current' }));
    await act(async () => {});
    expect(screen.getByText('Other saved words')).toBeTruthy();
    expect(screen.getByLabelText('body')).toHaveValue('My words');
    fireEvent.click(
      screen.getByRole('button', { name: 'save_compared_draft' })
    );
    await act(async () => {});
    expect(api.update.mock.calls[1]?.[2]).toMatchObject({
      expectedRevision: 2,
      document: { body: 'My words' },
    });
    expect(api.update.mock.calls[1]?.[2].operationId).not.toBe(
      api.update.mock.calls[0]?.[2].operationId
    );
    expect(onSaved).toHaveBeenCalledWith({
      ...entry,
      body: 'My words',
      revision: 3,
    });
  });
  it('associates invalid timezone and UTC timestamp errors with their fields', () => {
    render(
      <JournalEditor
        actorId={actorId}
        wsId={wsId}
        entry={entry}
        timezone="UTC"
        onSaved={vi.fn()}
        onBusy={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('timezone'), {
      target: { value: 'unknown/zone' },
    });
    expect(screen.getByLabelText('timezone')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByLabelText('timezone')).toHaveAttribute(
      'aria-describedby',
      'journal-zone-error'
    );
    expect(screen.getByText('invalid_timezone')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('occurred_at'), {
      target: { value: 'not a date' },
    });
    expect(screen.getByLabelText('occurred_at')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByLabelText('occurred_at')).toHaveAttribute(
      'aria-describedby',
      'journal-time-error'
    );
    expect(screen.getByText('time_error')).toBeTruthy();
    expect(api.update).not.toHaveBeenCalled();
  });
  it('does not apply a late receipt after the owning editor unmounts', async () => {
    let resolve: ((value: unknown) => void) | undefined;
    api.update.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const onSaved = vi.fn();
    const view = render(
      <JournalEditor
        actorId={actorId}
        wsId={wsId}
        entry={entry}
        timezone="UTC"
        onSaved={onSaved}
        onBusy={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('body'), {
      target: { value: 'Changed words' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    view.unmount();
    await act(async () => {
      resolve?.({ ...entry, body: 'Changed words', revision: 2 });
    });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
