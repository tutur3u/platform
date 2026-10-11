// @vitest-environment jsdom
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { NextIntlClientProvider } from 'next-intl';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vn from '../../messages/vi.json';
import { createStarterDraft } from './starter-drafts';
import { WikiDetailsEditor } from './wiki-details-editor';
import { WikiFactsEditor } from './wiki-facts-editor';
import { wikiOf } from './wiki-model';

for (const [locale, messages] of [
  ['en', en],
  ['vi', vn],
] as const) {
  it(`reorders identical labels by position, preserves wiki data and follows keyboard focus in ${locale}`, async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const original = createStarterDraft('Character', 'blank', (key) => key);
    original.wiki = {
      ...wikiOf(original),
      aliases: ['Alias'],
      facts: [
        { label: 'Detail', value: 'First' },
        { label: 'Detail', value: 'Second' },
        { label: 'Last', value: 'Third' },
      ],
    };
    const changed = vi.fn();
    function Harness() {
      const [draft, setDraft] = useState<LettinDraft>(original);
      return (
        <WikiDetailsEditor
          draft={draft}
          entries={[]}
          recordId="entry"
          onChange={(wiki) => {
            changed(wiki);
            setDraft({ ...draft, wiki });
          }}
        />
      );
    }
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          <NextIntlClientProvider
            locale={locale}
            messages={messages}
            timeZone="UTC"
          >
            <Harness />
          </NextIntlClientProvider>
        )
      );
      const button = (index: number, direction: string) =>
        container.querySelector<HTMLButtonElement>(
          `[data-fact-index="${index}"] [data-move="${direction}"]`
        )!;
      expect(changed).not.toHaveBeenCalled();
      expect(button(0, 'up').disabled).toBe(true);
      expect(button(2, 'down').disabled).toBe(true);
      expect(button(1, 'up').getAttribute('aria-label')).toContain('2');
      await act(() => button(1, 'up').click());
      expect(changed.mock.lastCall?.[0]).toEqual({
        ...original.wiki,
        facts: [
          original.wiki!.facts[1],
          original.wiki!.facts[0],
          original.wiki!.facts[2],
        ],
      });
      expect(document.activeElement).toBe(button(0, 'down'));
      await act(() => button(0, 'down').click());
      expect(changed.mock.lastCall?.[0]).toEqual(original.wiki);
      expect(document.activeElement).toBe(button(1, 'down'));
      expect(original.wiki!.facts.map((fact) => fact.value)).toEqual([
        'First',
        'Second',
        'Third',
      ]);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
}
it('keeps one fact immovable and preserves the 40-fact insertion boundary', async () => {
  const container = document.createElement('div'),
    root = createRoot(container),
    changed = vi.fn();
  const render = (count: number) => (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <WikiFactsEditor
        facts={Array.from({ length: count }, () => ({ label: '', value: '' }))}
        onChange={changed}
      />
    </NextIntlClientProvider>
  );
  try {
    await act(() => root.render(render(1)));
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('[data-move]')].every(
        (button) => button.disabled
      )
    ).toBe(true);
    await act(() => root.render(render(40)));
    expect(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === en.lettin.addFact
      )?.disabled
    ).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
  }
});
