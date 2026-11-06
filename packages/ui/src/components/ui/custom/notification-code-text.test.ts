import { expect, it } from 'vitest';
import { notificationDisplayText } from './notification-code-text';

const stored = {
  code: 'calendar_reconnect_required',
  title: 'Reconnect your calendar',
  description: 'Stored English text',
};

it('renders a localized title and description by code', () => {
  expect(
    notificationDisplayText(stored, {
      calendar_reconnect_required: {
        title: 'Kết nối lại lịch của bạn',
        description: 'Đồng bộ lịch đã tạm dừng.',
      },
    })
  ).toEqual({
    title: 'Kết nối lại lịch của bạn',
    description: 'Đồng bộ lịch đã tạm dừng.',
  });
});

it('falls back to the stored text without a translation or code', () => {
  expect(notificationDisplayText(stored)).toEqual({
    title: stored.title,
    description: stored.description,
  });
  expect(
    notificationDisplayText(
      { ...stored, code: null },
      { calendar_reconnect_required: { title: 'x' } }
    ).title
  ).toBe(stored.title);
});
