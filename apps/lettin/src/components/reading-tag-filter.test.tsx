// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { ReadingTagFilter } from './reading-tag-filter';
import { createStarterDraft } from './starter-drafts';

const draft = createStarterDraft('Published', 'blank', (key) => key);
const entries = [
  {
    id: 'public',
    published: { ...draft, tags: ['Magic', '<script>art</script>', 'Magic'] },
    draft: { tags: ['private-secret'] },
  },
];
for (const [locale, messages] of [
  ['en', en],
  ['vi', viMessages],
] as const) {
  it(`offers escaped unique published tag suggestions and accepts explicit input (${locale})`, async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const onChange = vi.fn();
    try {
      await act(() =>
        root.render(
          <NextIntlClientProvider
            locale={locale}
            messages={messages}
            timeZone="UTC"
          >
            <ReadingTagFilter entries={entries} value="" onChange={onChange} />
          </NextIntlClientProvider>
        )
      );
      const field = host.querySelector('input')!;
      expect(host.querySelector('label')?.htmlFor).toBe(field.id);
      expect(host.querySelector('label')?.textContent).toBe(
        messages.lettin.readingEntryTag
      );
      expect(host.textContent).toContain(messages.lettin.readingEntryTagHint);
      expect(
        [...host.querySelectorAll('option')].map((option) => option.value)
      ).toEqual(['<script>art</script>', 'Magic']);
      expect(host.innerHTML).not.toContain('private-secret');
      expect(host.querySelector('script')).toBeNull();
      expect(field.maxLength).toBe(40);
      await act(() => {
        field.value = 'Unlisted';
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith('Unlisted');
    } finally {
      await act(() => root.unmount());
    }
  });
}
it('bounds suggestions independently of manually entered tag values', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ReadingTagFilter
        entries={Array.from({ length: 105 }, (_, index) => ({
          id: String(index),
          published: {
            ...draft,
            tags: [`Tag${String(index).padStart(3, '0')}`],
          },
        }))}
        value="Tag104"
        onChange={() => {}}
      />
    </NextIntlClientProvider>
  );
  expect(host.querySelectorAll('option')).toHaveLength(100);
  expect(host.querySelector('input')?.value).toBe('Tag104');
  expect(host.querySelector('option[value="Tag104"]')).toBeNull();
});
