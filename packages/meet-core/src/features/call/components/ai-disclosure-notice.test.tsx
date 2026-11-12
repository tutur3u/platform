// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import type { MeetAiDisclosure } from '../../meeting-ai/ai-disclosure-state';
import { AiDisclosureNotice } from './ai-disclosure-notice';
import { MeetingAiPanel } from '../../meeting-ai/meeting-ai-panel';
import type { useMeetingAi } from '../../meeting-ai/use-meeting-ai';

vi.mock('../../../constants/common', () => ({
  TTR_URL: 'https://tuturuuu.com',
}));
afterEach(cleanup);

it.each(['en', 'vi'] as const)(
  'renders active facts and legal links in %s without controls or a date',
  (locale) => {
    const messages = locale === 'en' ? en : viMessages;
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AiDisclosureNotice
          audience="guest"
          disclosure={{ kind: 'active', transcription: true, mira: true }}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole('status').textContent).toContain(
      messages.meet_ai_notice.active_title
    );
    expect(screen.getByText(messages.meet_ai_notice.active_mira)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    ).toEqual(
      ['privacy', 'terms', 'legal/subprocessors'].map(
        (path) => `https://tuturuuu.com/${locale === 'vi' ? 'vi/' : ''}${path}`
      )
    );
    expect(screen.queryByText(/2026-11-12/)).toBeNull();
  }
);

it.each(['hidden', 'available', 'off', 'error'] as const)(
  'never claims guests are off when their transcription status is unknown: %s',
  (kind) => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AiDisclosureNotice
          audience="guest"
          disclosure={{ kind } as MeetAiDisclosure}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(en.meet_ai_notice.guest)).toBeTruthy();
    expect(screen.queryByText(en.meet_ai_notice.off)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    if (kind === 'error')
      expect(screen.getByRole('alert').textContent).toContain(
        en.meet_ai_notice.error
      );
  }
);

it.each(['hidden', 'available', 'off', 'error'] as const)(
  'renders member %s truthfully',
  (kind) => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AiDisclosureNotice audience="member" disclosure={{ kind }} />
      </NextIntlClientProvider>
    );
    if (kind === 'hidden') expect(container.innerHTML).toBe('');
    else expect(screen.getByText(en.meet_ai_notice[kind])).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  }
);

it('does not label stale disabled panel data off after a failed status lookup', () => {
  const ai = {
    data: {
      available: false,
      sessions: [],
      configured: true,
      canManage: false,
      chunks: [],
    },
    error: new Error('status failed'),
    isLoading: false,
  } as unknown as ReturnType<typeof useMeetingAi>;
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MeetingAiPanel ai={ai} />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('alert').textContent).toBe(en.meet_ai_notice.error);
  expect(screen.queryByText(en.meet_ai_notice.off)).toBeNull();
});
