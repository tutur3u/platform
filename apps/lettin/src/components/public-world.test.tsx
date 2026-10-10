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
