// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';
import en from '../../../../../apps/meet/messages/en.json';
import vi from '../../../../../apps/meet/messages/vi.json';
import { hashMiraConsentText, useMiraConsentText } from './mira-consent-box';

// SHA-256 of the notice text as origin/main 75546330ac hashes it, per locale
// and notice mode. A change to the hashed keys, their order, the mode
// selection or any of their strings changes these and forces re-consent, so
// it must be a deliberate decision.
const PINNED = {
  en: {
    room: 'c50f41bb0f87b1af544aa0609d662f9079ce326bde7900c8b0a5a296fc12088b',
    self: '52c7b658eebe2c6bac03e4c03ea558f5212b7269fbd8cbf0b7efa89e88ff2054',
  },
  vi: {
    room: '9687b20ceaa56ab5477371ded365dc43bb454bb56c72c6df583ca969b68f89da',
    self: '57c93996469e96e5fd7c5aad55d6a04a110e8dd10cf066d6edf3d66dc3f76054',
  },
} as const;
const bundles = { en, vi };

it.each(
  (['en', 'vi'] as const).flatMap((locale) =>
    (['room', 'self'] as const).map((mode) => [locale, mode] as const)
  )
)(
  'hashes the %s %s notice to the value origin/main produces',
  async (locale, mode) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale={locale} messages={bundles[locale]}>
        {children}
      </NextIntlClientProvider>
    );
    const { result } = renderHook(() => useMiraConsentText(mode), { wrapper });
    expect(await hashMiraConsentText(result.current)).toBe(
      PINNED[locale][mode]
    );
  }
);
