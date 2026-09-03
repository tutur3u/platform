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
      expectedDescriptions: [
        'Configure your work, meeting, and personal hours',
        'Set workspace-level calendar preferences',
      ],
    },
    {
      locale: 'vi' as const,
      messages: viMessages,
      expected: ['Khung giờ', 'Múi giờ và ngày bắt đầu tuần'],
      expectedDescriptions: [
        'Thiết lập giờ làm việc, giờ họp và thời gian cá nhân',
        'Thiết lập tùy chọn lịch ở cấp không gian làm việc',
      ],
    },
  ])(
    'renders the live hours sections in $locale',
    ({ locale, messages, expected, expectedDescriptions }) => {
      renderContent({ locale, messages, section: 'calendar_hours' });

      for (const heading of expected) {
        expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      }
      for (const description of expectedDescriptions) {
        expect(screen.getByText(description)).toBeTruthy();
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
      expectedDescription: 'Customize colors for different event categories',
    },
    {
      locale: 'vi' as const,
      messages: viMessages,
      expected: 'Màu danh mục',
      expectedDescription: 'Tùy chỉnh màu cho từng danh mục sự kiện',
    },
  ])(
    'renders the live colors section in $locale',
    ({ locale, messages, expected, expectedDescription }) => {
      renderContent({ locale, messages, section: 'calendar_colors' });

      expect(screen.getByRole('heading', { name: expected })).toBeTruthy();
      expect(screen.getByText(expectedDescription)).toBeTruthy();
      expect(screen.getByText('category-colors')).toBeTruthy();
    }
  );
});
