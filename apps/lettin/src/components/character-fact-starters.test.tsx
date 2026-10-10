// @vitest-environment jsdom
import type { LettinDraft, LettinKind } from '@tuturuuu/internal-api/lettin';
import { NextIntlClientProvider } from 'next-intl';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vn from '../../messages/vi.json';
import { WikiDetailsEditor } from './wiki-details-editor';

const container = document.createElement('div');
const root = createRoot(container);
const changed = vi.fn();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const original: LettinDraft = {
  title: 'Character',
  description: '',
  image: '',
  credit: '',
  kind: 'character',
  tags: [],
  links: [],
  content: { type: 'doc', content: [] },
  wiki: {
    aliases: ['Alias'],
    facts: [
      { label: 'Appearance', value: 'Authored appearance' },
      { label: 'Custom', value: 'Preserved' },
    ],
    relationships: [{ targetId: 'target', kind: 'related', label: 'Friend' }],
  },
};
function Harness({
  initial = original,
  kind = 'character',
}: {
  initial?: LettinDraft;
  kind?: LettinKind;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <WikiDetailsEditor
      draft={{ ...draft, kind }}
      entries={[]}
      recordId="character"
      onChange={(wiki) => {
        changed(wiki);
        setDraft((previous) => ({ ...previous, wiki }));
      }}
    />
  );
}
afterEach(async () => {
  await act(() => root.render(null));
  changed.mockClear();
});
const choose = async (value: string) => {
  const select = container.querySelector<HTMLSelectElement>('select')!;
  await act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const addButton = (text: string) =>
  [...container.querySelectorAll('button')].find(
    (button) => button.textContent === text
  )!;
for (const [locale, messages] of [
  ['en', en],
  ['vi', vn],
] as const) {
  it(`adds only the explicitly chosen localized label and preserves authored wiki fields in ${locale}`, async () => {
    const before = structuredClone(original);
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
    const button = addButton(messages.lettin.characterFactAdd);
    expect(button.disabled).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect(
      container.querySelector('select')?.labels?.[0]?.textContent
    ).toContain(messages.lettin.characterFactStarter);
    expect(container.querySelector('select')?.options).toHaveLength(5);
    await choose('appearance');
    expect(changed).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    await act(() => button.click());
    expect(changed.mock.lastCall?.[0]).toEqual({
      ...original.wiki,
      facts: [
        ...original.wiki!.facts,
        { label: messages.lettin.characterFact_appearance, value: '' },
      ],
    });
    expect(container.querySelector('select')?.value).toBe('');
    expect(button.disabled).toBe(true);
    expect(original).toEqual(before);
    expect(messages.lettin.characterFact_appearance.length).toBeLessThanOrEqual(
      80
    );
  });
}
it('keeps a chosen Vietnamese label as authored text after changing the interface language', async () => {
  await act(() =>
    root.render(
      <NextIntlClientProvider locale="vi" messages={vn} timeZone="UTC">
        <Harness />
      </NextIntlClientProvider>
    )
  );
  await choose('motivation');
  await act(() => addButton(vn.lettin.characterFactAdd).click());
  await act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Harness />
      </NextIntlClientProvider>
    )
  );
  expect(
    [...container.querySelectorAll('input')].some(
      (input) => input.value === vn.lettin.characterFact_motivation
    )
  ).toBe(true);
  expect(
    [...container.querySelectorAll('input')].some(
      (input) => input.value === en.lettin.characterFact_motivation
    )
  ).toBe(false);
});
it('respects the 40-fact boundary without replacing existing facts', async () => {
  const facts = Array.from({ length: 39 }, (_, index) => ({
    label: `Fact ${index}`,
    value: `Value ${index}`,
  }));
  await act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Harness
          initial={{ ...original, wiki: { ...original.wiki!, facts } }}
        />
      </NextIntlClientProvider>
    )
  );
  await choose('abilities');
  await act(() => addButton(en.lettin.characterFactAdd).click());
  expect(changed.mock.lastCall?.[0].facts).toEqual([
    ...facts,
    { label: en.lettin.characterFact_abilities, value: '' },
  ]);
  expect(container.querySelector('select')?.disabled).toBe(true);
  expect(addButton(en.lettin.characterFactAdd).disabled).toBe(true);
  await act(() => addButton(en.lettin.characterFactAdd).click());
  expect(changed).toHaveBeenCalledTimes(1);
});
it('shows starter controls only for character entries and clears transient choice after leaving that kind', async () => {
  await act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Harness />
      </NextIntlClientProvider>
    )
  );
  await choose('personality');
  await act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Harness kind="story" />
      </NextIntlClientProvider>
    )
  );
  expect(
    [...container.querySelectorAll('select')].some((select) =>
      select.labels?.[0]?.textContent?.includes(en.lettin.characterFactStarter)
    )
  ).toBe(false);
  expect(container.textContent).toContain(en.lettin.addFact);
  expect(changed).not.toHaveBeenCalled();
  await act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Harness />
      </NextIntlClientProvider>
    )
  );
  expect(container.querySelector('select')?.value).toBe('');
});
