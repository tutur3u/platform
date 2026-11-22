// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../../../../../../apps/calendar/messages/en.json';
import vi from '../../../../../../../../apps/calendar/messages/vi.json';
import { DateError, OverlapWarning } from '../event-form-components';

const catalogs = { en, vi } as const;

const event = (title: string) => ({
  id: title,
  title,
  start_at: '2026-11-22T02:00:00.000Z',
  end_at: '2026-11-22T02:30:00.000Z',
});

function renderWarning(locale: 'en' | 'vi', count: number) {
  return render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      <OverlapWarning
        overlappingEvents={Array.from({ length: count }, (_, index) =>
          event(`Event ${index}`)
        )}
      />
      <DateError error="x" />
    </NextIntlClientProvider>
  );
}

describe('event dialog messages', () => {
  it('pluralizes the overlap warning in English', () => {
    const one = renderWarning('en', 1);
    expect(
      screen.getByText(/This event overlaps with 1 other event\./)
    ).toBeTruthy();
    expect(screen.getByText('Scheduling conflict')).toBeTruthy();
    expect(screen.getByText('Check the dates')).toBeTruthy();
    one.unmount();

    renderWarning('en', 5);
    expect(
      screen.getByText(/This event overlaps with 5 other events\./)
    ).toBeTruthy();
    expect(screen.getByText('and 2 more')).toBeTruthy();
  });

  it('renders the overlap warning in Vietnamese', () => {
    renderWarning('vi', 5);
    expect(
      screen.getByText(/Sự kiện này trùng với 5 sự kiện khác\./)
    ).toBeTruthy();
    expect(screen.getByText('và 2 sự kiện khác')).toBeTruthy();
    expect(screen.getByText('Trùng lịch')).toBeTruthy();
  });

  it.each(['en', 'vi'] as const)(
    'formats every count message in %s',
    (locale) => {
      const t = createTranslator({
        locale,
        messages: catalogs[locale],
        namespace: 'calendar.event_dialog',
      });
      expect(t('generated_saved', { saved: 1, total: 2 })).toContain('1');
      expect(t('generated_failed', { count: 1 })).toContain('1');
      expect(t('preview_title', { count: 2 })).not.toContain('{');
      expect(t('save_generated', { count: 1 })).not.toContain('{');
      expect(t('suggestion_categories', { categories: 'Work' })).toContain(
        'Work'
      );
      expect(t('color_value', { color: 'Blue' })).toContain('Blue');
    }
  );
});
