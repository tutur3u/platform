// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { WritingStatistics } from './writing-statistics';

for (const [locale, messages] of [
  ['en', en],
  ['vi', vi],
] as const) {
  it(`updates current private body counts and explains unapplied Markdown in ${locale}`, async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const render = (value: string, sourcePending: boolean) => (
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <WritingStatistics
          content={{
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: value }] },
            ],
          }}
          sourcePending={sourcePending}
        />
      </NextIntlClientProvider>
    );
    try {
      await act(() => root.render(render('One two', false)));
      expect(
        [...container.querySelectorAll('dd')].map((n) => n.textContent)
      ).toEqual(['2', '6']);
      expect(container.textContent).toContain(
        messages.lettin.writingStatisticsHint
      );
      await act(() => root.render(render('One', true)));
      expect(
        [...container.querySelectorAll('dd')].map((n) => n.textContent)
      ).toEqual(['1', '3']);
      expect(container.textContent).toContain(
        messages.lettin.writingSourcePending
      );
      expect(container.querySelector('a, button, input')).toBeNull();
    } finally {
      await act(() => root.unmount());
    }
  });
}
