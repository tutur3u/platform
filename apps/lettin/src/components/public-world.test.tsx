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
vi.mock('./wiki-browser', () => ({ WikiBrowser: () => <section /> }));

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
