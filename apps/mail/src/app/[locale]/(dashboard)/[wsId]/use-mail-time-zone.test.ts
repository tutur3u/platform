// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { NextIntlClientProvider, useTimeZone } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMailTimeZone } from './use-mail-time-zone';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(NextIntlClientProvider, {
    locale: 'en',
    timeZone: 'UTC',
    messages: {},
    children,
  });
}

it.each(['Asia/Ho_Chi_Minh', 'UTC'])(
  'uses browser %s despite inherited server UTC',
  (zone) => {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolved,
      timeZone: zone,
    });
    const { result } = renderHook(
      () => ({
        inherited: useTimeZone(),
        viewer: useMailTimeZone(),
      }),
      { wrapper }
    );
    expect(result.current).toEqual({ inherited: 'UTC', viewer: zone });
  }
);
