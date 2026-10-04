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
