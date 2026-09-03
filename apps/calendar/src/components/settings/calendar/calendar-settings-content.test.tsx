import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import viMessages from '../../../../messages/vi.json';
import { CalendarSettingsContent } from './calendar-settings-content';

vi.mock('./hour-settings', () => ({
  HoursSettings: () => <div>hours-settings</div>,
}));

vi.mock('./workspace-calendar-preferences', () => ({
  WorkspaceCalendarPreferences: () => <div>calendar-preferences</div>,
}));

vi.mock('./category-color-settings', () => ({
  CategoryColorsSettings: () => <div>category-colors</div>,
}));

afterEach(cleanup);

function renderContent({
  locale,
  messages,
  section,
}: {
  locale: 'en' | 'vi';
  messages: typeof enMessages;
  section: 'calendar_hours' | 'calendar_colors';
}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CalendarSettingsContent
        section={section}
        wsId="workspace-1"
        workspace={null}
      />
    </NextIntlClientProvider>
  );
}

describe('CalendarSettingsContent', () => {
  it.each([
    {
      locale: 'en' as const,
      messages: enMessages,
      expected: ['Hours', 'Timezone & First Day of Week'],
    },
    {
      locale: 'vi' as const,
      messages: viMessages,
      expected: ['Khung giờ', 'Múi giờ và ngày bắt đầu tuần'],
    },
  ])(
    'renders the live hours sections in $locale',
    ({ locale, messages, expected }) => {
      renderContent({ locale, messages, section: 'calendar_hours' });

      for (const heading of expected) {
        expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      }
      expect(screen.getByText('hours-settings')).toBeTruthy();
      expect(screen.getByText('calendar-preferences')).toBeTruthy();
    }
  );

  it.each([
    {
      locale: 'en' as const,
      messages: enMessages,
      expected: 'Category Colors',
    },
    {
      locale: 'vi' as const,
      messages: viMessages,
      expected: 'Màu danh mục',
    },
  ])(
    'renders the live colors section in $locale',
    ({ locale, messages, expected }) => {
      renderContent({ locale, messages, section: 'calendar_colors' });

      expect(screen.getByRole('heading', { name: expected })).toBeTruthy();
      expect(screen.getByText('category-colors')).toBeTruthy();
    }
  );

  it('keeps retired English copy out of the live settings sources', () => {
    const files = [
      'calendar-settings-content.tsx',
      'category-color-settings.tsx',
      'color-picker.tsx',
      'hour-settings.tsx',
      'hours-overview.tsx',
      'time-range-picker.tsx',
    ];
    const source = files
      .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n');
    const retiredLiterals = [
      'Configure your work, meeting, and personal hours',
      'Customize colors for different event categories',
      'Copy to all days?',
      'No categories yet. Add one to get started.',
      'Remove time block',
    ];

    for (const literal of retiredLiterals) {
      expect(source).not.toContain(literal);
    }
  });
});
