// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../apps/meet/messages/vi.json';

const mocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));

import { showMeetingAiFailure } from './failure-toast';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows actionable credits guidance and logs only fixed status/code metadata', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  showMeetingAiFailure((key) => key, {
    status: 402,
    code: 'synthetic-private-code',
    message: 'synthetic-private-provider-body',
  });
  expect(mocks.error).toHaveBeenCalledWith('failed', {
    description: 'failure_credits',
  });
  expect(warning).toHaveBeenCalledWith('Meeting AI request failed', {
    status: 402,
    code: null,
  });
  expect(
    JSON.stringify([mocks.error.mock.calls, warning.mock.calls])
  ).not.toContain('synthetic-private');
});

function FailureAction() {
  const t = useTranslations('meet.ai');
  return (
    <button
      type="button"
      onClick={() => showMeetingAiFailure(t, { status: 402 })}
    >
      Synthetic failure
    </button>
  );
}
for (const [locale, messages, expected] of [
  [
    'en',
    en,
    'AI credits are unavailable. Check your AI Hub balance before retrying.',
  ],
  [
    'vi',
    viMessages,
    'Không đủ tín dụng AI. Kiểm tra số dư AI Hub trước khi thử lại.',
  ],
] as const) {
  it(`${locale} renders real localized credit guidance`, () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <FailureAction />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic failure' }));
    expect(mocks.error).toHaveBeenLastCalledWith(messages.meet.ai.failed, {
      description: expected,
    });
  });
}
