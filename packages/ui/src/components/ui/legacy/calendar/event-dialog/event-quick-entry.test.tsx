// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CalendarEventCreationDraft } from '../../../../../hooks/calendar-event-create-payload';
import { EventQuickEntry } from './event-quick-entry';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('../provider-color-picker', () => ({
  ProviderColorPicker: ({ compact }: { compact?: boolean }) => (
    <button type="button">{compact ? 'compact color' : 'color row'}</button>
  ),
}));
vi.mock('../calendar-event-guests', () => ({
  CalendarEventParticipants: () => null,
}));

function renderEntry(
  overrides: Partial<ComponentProps<typeof EventQuickEntry>> = {},
  draft: CalendarEventCreationDraft = {
    title: 'Design review',
    location: '',
    description: '',
    color: 'BLUE',
  }
) {
  const props = {
    event: draft,
    setEvent: vi.fn(),
    isEditing: false,
    when: <div>When fields</div>,
    sourceOptions: [],
    onSourceChange: vi.fn(),
    isSaving: false,
    isDeleting: false,
    dateError: null,
    overlappingEvents: [],
    showOverlapWarning: false,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onToggleLock: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof EventQuickEntry>;
  render(<EventQuickEntry {...props} />);
  return props;
}

describe('EventQuickEntry', () => {
  it('saves on Enter in the title and location, never mid-composition', () => {
    const props = renderEntry();
    const title = screen.getByRole('textbox', { name: 'title_label' });
    const location = screen.getByRole('textbox', { name: 'location_label' });

    fireEvent.keyDown(title, { key: 'Enter', isComposing: true });
    expect(props.onSave).not.toHaveBeenCalled();

    fireEvent.keyDown(title, { key: 'Enter' });
    fireEvent.keyDown(location, { key: 'Enter' });
    expect(props.onSave).toHaveBeenCalledTimes(2);
  });

  it('keeps Enter as a new line in the description', () => {
    const props = renderEntry();
    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'description_label' }),
      { key: 'Enter' }
    );
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('focuses the title first and uses the compact color control', () => {
    renderEntry();
    expect(screen.getByRole('textbox', { name: 'title_label' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'compact color' })).toBeTruthy();
  });

  it('keeps the actions in a footer outside the scrolling body', () => {
    const props = renderEntry();
    const footer = document.querySelector(
      '[data-slot="event-dialog-footer"]'
    ) as HTMLElement;
    const body = document.querySelector(
      '[data-slot="event-dialog-body"]'
    ) as HTMLElement;
    expect(body.contains(footer)).toBe(false);

    fireEvent.click(within(footer).getByRole('button', { name: 'cancel' }));
    fireEvent.click(within(footer).getByRole('button', { name: /create/ }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onSave).toHaveBeenCalledOnce();
    expect(within(footer).queryByRole('button', { name: 'delete' })).toBeNull();
  });

  it('offers Save changes and Delete while editing', () => {
    const props = renderEntry({ isEditing: true });
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /save/ })).toBeTruthy();
  });

  it('exposes the lock as a pressed toggle', () => {
    const props = renderEntry({}, { title: '', locked: true });
    const lock = screen.getByRole('button', { name: 'lock' });
    expect(lock.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(lock);
    expect(props.onToggleLock).toHaveBeenCalledOnce();
  });

  it('shows the date error and overlap warning with localized titles', () => {
    renderEntry({
      dateError: 'date_error',
      showOverlapWarning: true,
      overlappingEvents: [
        {
          id: 'e1',
          title: 'Standup',
          start_at: '2026-11-22T02:00:00.000Z',
          end_at: '2026-11-22T02:30:00.000Z',
        } as never,
      ],
    });

    expect(screen.getByText('date_error_title')).toBeTruthy();
    expect(screen.getByText('date_error')).toBeTruthy();
    expect(screen.getByText('overlap_title')).toBeTruthy();
    expect(screen.getByText(/Standup/)).toBeTruthy();
  });

  it('disables every action while saving', () => {
    renderEntry({ isSaving: true });
    for (const name of ['cancel', /saving/]) {
      expect(
        (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
      ).toBe(true);
    }
  });
});
