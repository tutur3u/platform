// @vitest-environment jsdom
import type { LettinPublicWorld } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PublicWorld } from './public-world';
import { createStarterDraft } from './starter-drafts';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
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
vi.mock('@tuturuuu/ui/public-link-button', () => ({
  PublicLinkButton: ({ url }: { url: string | null }) => (
    <output data-public-link={url ?? ''} />
  ),
}));
vi.mock('./document-view', () => ({ DocumentView: () => <article /> }));
vi.mock('./wiki-browser', () => ({
  WikiBrowser: ({ entries }: { entries: { draft: { title: string } }[] }) => (
    <section data-browser>
      {entries.map(({ draft }) => draft.title).join(' · ')}
    </section>
  ),
}));

it('renders published links and backlinks without relying on private draft fields', async () => {
  const makeDraft = (title: string, links: string[]) => ({
    ...createStarterDraft(title, 'blank', (key) => key),
    links,
  });
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published: makeDraft('World', []),
    entries: [
      { id: 'selected', published: makeDraft('Selected', ['linked']) },
      { id: 'linked', published: makeDraft('Published link', []) },
      {
        id: 'backlink',
        published: makeDraft('Published backlink', ['selected']),
      },
    ],
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(<PublicWorld world={world} initialEntry="selected" />)
    );
    const sections = [...container.querySelectorAll('section')];
    expect(
      sections.find(
        (s) => s.querySelector('h2')?.textContent === 'linkedEntries'
      )?.textContent
    ).toContain('Published link');
    expect(
      sections.find((s) => s.querySelector('h2')?.textContent === 'backlinks')
        ?.textContent
    ).toContain('Published backlink');
  } finally {
    await act(() => root.unmount());
  }
});

it('searches published body text without indexing extra private draft data', async () => {
  const published = createStarterDraft('Public entry', 'blank', (key) => key);
  published.content = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Visible reader words' }],
      },
    ],
  };
  const source = {
    id: 'entry',
    published,
    draft: {
      ...published,
      content: {
        type: 'doc',
        content: [{ type: 'text', text: 'Private hidden words' }],
      },
    },
  };
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published: createStarterDraft('World', 'blank', (key) => key),
    entries: [source],
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(<PublicWorld world={world} />));
    const input = container.querySelector('input')!;
    const search = async (value: string) => {
      await act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await search('visible reader');
    expect(container.querySelector('nav')!.textContent).toContain(
      'Public entry'
    );
    await search('private hidden');
    expect(container.querySelector('nav')!.textContent).not.toContain(
      'Public entry'
    );
    expect(container.textContent).not.toContain('Private hidden words');
    await search('');
    expect(container.querySelector('nav')!.textContent).toContain(
      'Public entry'
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

it('copies only notebook or known published-entry URLs, ignoring arbitrary query-selected IDs', async () => {
  const worldId = '00000000-0000-4000-8000-000000000001',
    entryId = '00000000-0000-4000-8000-000000000002';
  const world: LettinPublicWorld = {
    id: worldId,
    creatorId: 'creator',
    published: createStarterDraft('World', 'blank', (key) => key),
    entries: [
      {
        id: entryId,
        published: createStarterDraft('Public entry', 'blank', (key) => key),
      },
    ],
  };
  const container = document.createElement('div'),
    root = createRoot(container);
  try {
    await act(() =>
      root.render(
        <PublicWorld world={world} initialEntry="unavailable-private" />
      )
    );
    expect(
      container.querySelector('output')!.getAttribute('data-public-link')
    ).toBe(`https://lettin.tuturuuu.com/worlds/${worldId}`);
    await act(() =>
      root.render(
        <PublicWorld key="known" world={world} initialEntry={entryId} />
      )
    );
    expect(
      container.querySelector('output')!.getAttribute('data-public-link')
    ).toBe(`https://lettin.tuturuuu.com/worlds/${worldId}?entry=${entryId}`);
  } finally {
    await act(() => root.unmount());
  }
});

it('uses the filtered published sidebar order for sequence navigation and entry URLs', async () => {
  const make = (title: string, kind: 'character' | 'location') => ({
    ...createStarterDraft(title, 'blank', (key) => key),
    kind,
  });
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published: make('Notebook', 'location'),
    entries: [
      { id: 'first', published: make('First character', 'character') },
      { id: 'location', published: make('Other location', 'location') },
      { id: 'last', published: make('Last character', 'character') },
    ],
  };
  window.history.replaceState(null, '', '/worlds/world?entry=first&keep=value');
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(<PublicWorld world={world} initialEntry="first" />)
    );
    const select = container.querySelector('select')!;
    await act(() => {
      select.value = 'characters';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(
      container.querySelector('nav[aria-label="readingSequence"]')
    ).toBeNull();
    const sidebar = container.querySelector('nav[aria-label="entries"]')!;
    await act(() =>
      sidebar.querySelector<HTMLButtonElement>('button')!.click()
    );
    const sequence = container.querySelector(
      'nav[aria-label="readingSequence"]'
    )!;
    expect(sequence.textContent).toContain('Last character');
    expect(sequence.textContent).not.toContain('Other location');
    await act(() =>
      sequence.querySelectorAll<HTMLButtonElement>('button')[1]!.click()
    );
    expect(new URL(window.location.href).searchParams.get('entry')).toBe(
      'last'
    );
    expect(new URL(window.location.href).searchParams.get('keep')).toBe(
      'value'
    );
    expect(
      container.querySelectorAll<HTMLButtonElement>(
        'nav[aria-label="readingSequence"] button'
      )[1]?.disabled
    ).toBe(true);
  } finally {
    await act(() => root.unmount());
  }
});

it('combines exact published tags with kind/search, removes stale sequence links and clears all filters', async () => {
  const make = (
    title: string,
    kind: 'character' | 'location',
    tags: string[]
  ) => ({ ...createStarterDraft(title, 'blank', (key) => key), kind, tags });
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published: make('Notebook', 'location', ['Notebook-only']),
    entries: [
      { id: 'first', published: make('First mage', 'character', ['Magic']) },
      { id: 'last', published: make('Last mage', 'character', ['Magic']) },
      { id: 'place', published: make('Mage tower', 'location', ['Magic']) },
      { id: 'other', published: make('Other hero', 'character', ['Other']) },
    ],
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  const input = async (field: HTMLInputElement, value: string) => {
    await act(() => {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await act(() =>
      root.render(<PublicWorld world={world} initialEntry="first" />)
    );
    const tag = host.querySelector<HTMLInputElement>('input[list]')!;
    expect(host.querySelector('option[value="Notebook-only"]')).toBeNull();
    await input(tag, ' Magic ');
    expect(
      host.querySelector('nav[aria-label="entries"]')?.textContent
    ).not.toContain('Other hero');
    expect(
      host.querySelector('nav[aria-label="entries"]')?.textContent
    ).toContain('Mage tower');
    const kind = host.querySelector('select')!;
    await act(() => {
      kind.value = 'characters';
      kind.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(
      host.querySelector('nav[aria-label="entries"]')?.textContent
    ).not.toContain('Mage tower');
    expect(host.querySelector('[data-browser]')?.textContent).toBe(
      'First mage · Last mage'
    );
    await act(() =>
      host
        .querySelector<HTMLButtonElement>('nav[aria-label="entries"] button')!
        .click()
    );
    expect(
      host.querySelector('nav[aria-label="readingSequence"]')?.textContent
    ).toContain('Last mage');
    const search = host.querySelector<HTMLInputElement>('input:not([list])')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(search, 'First');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('nav[aria-label="entries"]')?.textContent).toBe(
      'First mage'
    );
    expect(host.querySelector('nav[aria-label="readingSequence"]')).toBeNull();
    await input(tag, 'magic');
    expect(host.querySelector('nav[aria-label="entries"]')?.textContent).toBe(
      ''
    );
    expect(host.querySelector('nav[aria-label="readingSequence"]')).toBeNull();
    expect(host.textContent).toContain('noReadingMatches');
    const clear = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'clearReadingFilters'
    )!;
    await act(() => clear.click());
    expect(tag.value).toBe('');
    expect(search.value).toBe('');
    expect(kind.value).toBe('overview');
    expect(
      host.querySelectorAll('nav[aria-label="entries"] button')
    ).toHaveLength(4);
    expect(host.querySelector('nav[aria-label="readingSequence"]')).toBeNull();
    await act(() => {
      kind.value = 'relationships';
      kind.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await input(tag, 'Other');
    expect(host.querySelector('[data-browser]')?.textContent).toBe(
      'Other hero'
    );
  } finally {
    await act(() => root.unmount());
  }
});

it('retains reader appearance when navigating between published entries in one notebook', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const first = createStarterDraft(
    'First published entry',
    'blank',
    (key) => key
  );
  const second = createStarterDraft(
    'Second published entry',
    'blank',
    (key) => key
  );
  const world: LettinPublicWorld = {
    id: 'reader-world',
    creatorId: 'creator',
    published: first,
    entries: [
      { id: 'first', published: first },
      { id: 'second', published: second },
    ],
  };
  const original = JSON.stringify(world);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(<PublicWorld world={world} initialEntry="first" />)
    );
    const size = [...container.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('readerTextSize'))
      ?.querySelector('select');
    expect(size).toBeDefined();
    await act(() => {
      size!.value = 'large';
      size!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const entry = [...container.querySelectorAll('nav button')].find(
      (button) => button.textContent === 'Second published entry'
    );
    expect(entry).toBeDefined();
    await act(() => (entry as HTMLButtonElement).click());
    expect(
      container
        .querySelector('.lettin-reader-presentation')
        ?.getAttribute('data-reader-size')
    ).toBe('large');
    expect(JSON.stringify(world)).toBe(original);
  } finally {
    await act(() => root.unmount());
  }
});

it('pauses reader choices in browsing, restores them on return and resets them for another notebook', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const published = createStarterDraft('Notebook', 'blank', (key) => key);
  const world: LettinPublicWorld = {
    id: 'reader-world',
    creatorId: 'creator',
    published,
    entries: [],
  };
  const original = JSON.stringify(world);
  const host = document.createElement('div');
  const root = createRoot(host);
  const choose = async (select: HTMLSelectElement, value: string) => {
    await act(() => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const presentation = () => host.querySelector('.lettin-reader-presentation')!;
  try {
    await act(() => root.render(<PublicWorld world={world} />));
    const controls =
      host.querySelectorAll<HTMLSelectElement>('fieldset select');
    await choose(controls[0]!, 'largest');
    await choose(controls[1]!, 'relaxed');
    const kind = host.querySelector<HTMLSelectElement>('aside select')!;
    await choose(kind, 'characters');
    expect(host.querySelector('fieldset')).toBeNull();
    expect(host.querySelector('[data-browser]')).not.toBeNull();
    expect(presentation().getAttribute('data-reader-size')).toBe('default');
    expect(presentation().getAttribute('data-reader-spacing')).toBe('default');
    await choose(kind, 'overview');
    expect(host.querySelector('[data-browser]')).toBeNull();
    expect(presentation().getAttribute('data-reader-size')).toBe('largest');
    expect(presentation().getAttribute('data-reader-spacing')).toBe('relaxed');
    expect(
      host.querySelectorAll<HTMLSelectElement>('fieldset select')[0]!.value
    ).toBe('largest');
    await act(() =>
      root.render(<PublicWorld world={{ ...world, id: 'other' }} />)
    );
    expect(presentation().getAttribute('data-reader-size')).toBe('default');
    expect(presentation().getAttribute('data-reader-spacing')).toBe('default');
    expect(
      host.querySelector<HTMLButtonElement>('fieldset button')!.disabled
    ).toBe(true);
    expect(JSON.stringify(world)).toBe(original);
  } finally {
    await act(() => root.unmount());
  }
});
