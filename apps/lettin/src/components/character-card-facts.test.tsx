// @vitest-environment jsdom
import type { LettinDraft, LettinRecord } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { CharacterCardFacts, characterCardFacts } from './character-card-facts';
import { PublicWorld } from './public-world';
import { WikiBrowser } from './wiki-browser';

let language: 'en' | 'vi' = 'en';
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (language === 'en' ? en : viMessages).lettin[key as keyof typeof en.lettin],
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
const draft = (title = 'Character'): LettinDraft => ({
  title,
  kind: 'character',
  description: '',
  image: '',
  credit: '',
  tags: [],
  links: [],
  content: { type: 'doc' },
  wiki: {
    aliases: [],
    relationships: [],
    facts: [
      { label: 'Role', value: 'Navigator' },
      { label: 'Home', value: 'Harbor' },
      { label: 'Era', value: 'Autumn' },
      { label: 'Secret fourth', value: 'Full entry only' },
    ],
  },
});
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  language = 'en';
  vi.clearAllMocks();
});
it('preserves first-three usable authored facts and unchanged source values', () => {
  const value = draft();
  value.wiki!.facts.unshift(
    { label: ' ', value: 'ignored' },
    { label: 'Empty', value: ' ' }
  );
  const before = JSON.stringify(value);
  expect(characterCardFacts(value)).toEqual([
    { label: 'Role', value: 'Navigator' },
    { label: 'Home', value: 'Harbor' },
    { label: 'Era', value: 'Autumn' },
  ]);
  expect(JSON.stringify(value)).toBe(before);
});
it('bounds preview text by Unicode code points without splitting surrogate pairs', () => {
  const value = draft();
  value.wiki!.facts = [{ label: 'x'.repeat(81), value: '𐐀'.repeat(161) }];
  const facts = characterCardFacts(value);
  expect(facts[0]!.label).toBe(`${'x'.repeat(80)}…`);
  expect(facts[0]!.value).toBe(`${'𐐀'.repeat(160)}…`);
  expect(value.wiki!.facts[0]!.value).toHaveLength(322);
});
it('omits previews for noncharacters, historical missing metadata and empty facts', () => {
  for (const value of [
    { ...draft(), kind: 'location' as const },
    { ...draft(), wiki: undefined },
    { ...draft(), wiki: { aliases: [], relationships: [], facts: [] } },
  ]) {
    expect(characterCardFacts(value)).toEqual([]);
    expect(renderToStaticMarkup(<CharacterCardFacts draft={value} />)).toBe('');
  }
});
it.each(['en', 'vi'] as const)(
  'renders real %s labels and escaped fact content with no nested actions',
  (locale) => {
    language = locale;
    const value = draft();
    value.wiki!.facts = [
      { label: '<script>label</script>', value: '<img src=x onerror=bad>' },
    ];
    const html = renderToStaticMarkup(<CharacterCardFacts draft={value} />);
    expect(html).toContain(
      (locale === 'en' ? en : viMessages).lettin.characterFactsPreview
    );
    expect(html).toContain('&lt;script&gt;label&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a ');
  }
);
it('uses saved authorized draft facts in studio cards and retains disabled/explicit selection', async () => {
  const select = vi.fn();
  const record: LettinRecord = {
    id: 'entry',
    version: 1,
    published_at: 'published',
    published: draft('Published'),
    draft: draft('Saved private'),
  };
  record.draft.wiki!.facts[0]!.value = 'Saved draft role';
  await act(() =>
    root.render(
      <WikiBrowser
        entries={[record]}
        section="characters"
        disabled
        onSelect={select}
      />
    )
  );
  expect(container.textContent).toContain('Saved draft role');
  const button =
    container.querySelector<HTMLButtonElement>('.wiki-entry-card')!;
  await act(() => button.click());
  expect(select).not.toHaveBeenCalled();
  await act(() =>
    root.render(
      <WikiBrowser
        entries={[record]}
        section="characters"
        disabled={false}
        onSelect={select}
      />
    )
  );
  await act(() =>
    container.querySelector<HTMLButtonElement>('.wiki-entry-card')!.click()
  );
  expect(select).toHaveBeenCalledExactlyOnceWith('entry');
});
it('renders public collection facts only from published snapshots and keeps full values in the selected entry', async () => {
  const published = draft('Published character');
  published.wiki!.facts[0]!.value = 'P'.repeat(200);
  const privateDraft = draft('Private title');
  privateDraft.wiki!.facts = [
    { label: 'Private fact', value: 'Private secret' },
  ];
  const world = {
    id: 'world',
    creatorId: 'creator',
    published: { ...draft('Notebook'), kind: 'world' as const },
    entries: [{ id: 'entry', published, draft: privateDraft }],
  };
  await act(() => root.render(<PublicWorld world={world} />));
  await act(() => {
    const select = container.querySelector<HTMLSelectElement>('aside select')!;
    select.value = 'characters';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const card = container.querySelector<HTMLButtonElement>('.wiki-entry-card')!;
  expect(card.textContent).toContain(`${'P'.repeat(160)}…`);
  expect(card.textContent).not.toContain('Secret fourth');
  expect(container.textContent).not.toContain('Private title');
  expect(container.textContent).not.toContain('Private secret');
  await act(() => card.click());
  expect(container.querySelector('article')!.textContent).toContain(
    'P'.repeat(200)
  );
  expect(container.querySelector('article')!.textContent).toContain(
    'Secret fourth'
  );
  expect(container.textContent).not.toContain('Private secret');
});
