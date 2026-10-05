import { render, screen } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
}));
vi.mock('./event-modal-header', () => ({
  EventModalHeader: ({ event }: { event: CalendarEvent }) => (
    <h1>{event.title}</h1>
  ),
}));

import { ProviderReadonlyDialog } from './provider-readonly-dialog';

describe('unsupported provider recurrence readonly details', () => {
  it('shows details without editable form, destructive actions or raw HTML injection', () => {
    render(
      <ProviderReadonlyDialog
        open
        onOpenChange={vi.fn()}
        event={
          {
            id: 'instance',
            title: 'Provider series',
            start_at: '2026-10-06T09:00:00Z',
            end_at: '2026-10-06T10:00:00Z',
            location: 'Room',
            description: '<script>private fixture</script>',
          } as CalendarEvent
        }
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Provider series' })
    ).toBeTruthy();
    expect(screen.getByText('Room')).toBeTruthy();
    expect(screen.getByText('<script>private fixture</script>')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });
});
