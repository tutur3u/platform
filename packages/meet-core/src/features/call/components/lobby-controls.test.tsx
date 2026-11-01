// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { LobbyParticipantSummary } from './lobby-controls';

function localized(child: ReactNode, locale: 'en' | 'vi' = 'en') {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : viMessages}
      timeZone="UTC"
    >
      {child}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

it.each(['en', 'vi'] as const)(
  'formats the overflow roster line as one ICU message in %s',
  (locale) => {
    const roster = [
      { userId: 'u1', displayName: 'Alice Nguyen' },
      { userId: 'u2', displayName: 'Bao Le' },
      { userId: 'u3', displayName: 'Chi Pham' },
      { userId: 'u4', displayName: 'Dung Vo' },
      { userId: 'u5', displayName: 'Giang Ho' },
    ];
    const view = render(
      localized(
        <LobbyParticipantSummary
          connected
          participants={roster}
          waiting={false}
        />,
        locale
      )
    );

    const expected =
      locale === 'en'
        ? 'Alice Nguyen, Bao Le, Chi Pham, Dung Vo (+1 more)'
        : 'Alice Nguyen, Bao Le, Chi Pham, Dung Vo (+1 người khác)';
    expect(within(view.container).getByText(expected)).toBeTruthy();
  }
);
