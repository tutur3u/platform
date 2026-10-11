import type {
  LettinPublicWorld,
  LettinRecord,
} from '@tuturuuu/internal-api/lettin';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { DocumentView } from './document-view';
import { PublicExplorer } from './public-explorer';
import { createStarterDraft } from './starter-drafts';
import { WikiBrowser } from './wiki-browser';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));

const draft = {
  ...createStarterDraft('Notebook', 'blank', (key) => key),
  image: 'https://example.com/art.png',
  contentNotice: '<script>spoilers</script>',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Reading content' }],
      },
    ],
  },
};
it('renders escaped reader guidance before artwork and rich text', () => {
  const html = renderToStaticMarkup(<DocumentView draft={draft} />);
  expect(html).toContain('&lt;script&gt;spoilers&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html.indexOf('contentNotice')).toBeLessThan(html.indexOf('<img'));
  expect(html.indexOf('contentNotice')).toBeLessThan(
    html.indexOf('Reading content')
  );
});
it('keeps historical and cleared drafts free of empty notice labels', () => {
  for (const contentNotice of [undefined, '', '   ']) {
    expect(
      renderToStaticMarkup(<DocumentView draft={{ ...draft, contentNotice }} />)
    ).not.toContain('contentNotice');
  }
});
it('reads discovery guidance from the published snapshot before card artwork', () => {
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published: draft,
    entries: [],
  };
  const html = renderToStaticMarkup(<PublicExplorer worlds={[world]} />);
  expect(html.indexOf('contentNotice')).toBeLessThan(html.indexOf('<img'));
  expect(html).toContain('&lt;script&gt;spoilers&lt;/script&gt;');
});
it('shows per-entry guidance in wiki cards before artwork', () => {
  const entry: LettinRecord = {
    id: 'entry',
    draft,
    published: null,
    version: 1,
    published_at: null,
  };
  const html = renderToStaticMarkup(
    <WikiBrowser
      entries={[entry]}
      section="characters"
      onSelect={() => {}}
      disabled={false}
    />
  );
  expect(html.indexOf('contentNotice')).toBeLessThan(html.indexOf('<img'));
});
