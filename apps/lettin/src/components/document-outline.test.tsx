// @vitest-environment jsdom
import type {
  LettinDraft,
  LettinNode,
  LettinPublicWorld,
} from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentView } from './document-view';
import { PublicWorld } from './public-world';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, args?: { count?: number; credit?: string }) =>
      args?.credit
        ? `${key}:${args.credit}`
        : args
          ? `${key}:${args.count}`
          : key,
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
const heading = (text: string): LettinNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const draft: LettinDraft = {
  title: 'Public document',
  description: '',
  kind: 'page',
  image: '',
  credit: '',
  tags: [],
  links: [],
  content: {
    type: 'doc',
    content: [
      heading('Opening'),
      {
        type: 'details',
        content: [
          {
            type: 'detailsSummary',
            content: [{ type: 'text', text: 'Folded content' }],
          },
          {
            type: 'detailsContent',
            content: [
              {
                type: 'details',
                content: [
                  {
                    type: 'detailsSummary',
                    content: [{ type: 'text', text: 'Inner fold' }],
                  },
                  {
                    type: 'detailsContent',
                    content: [heading('Hidden chapter')],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  vi.restoreAllMocks();
});
it('renders no outline or navigation IDs in the default private preview', () => {
  const html = renderToStaticMarkup(<DocumentView draft={draft} />);
  expect(html).not.toContain('documentOutline');
  expect(html).not.toContain('data-lettin-heading');
  expect(html).not.toContain('tabindex="-1"');
});
it('renders escaped outline labels and exactly matching scoped heading targets', () => {
  const copy = {
    ...draft,
    content: {
      type: 'doc',
      content: [
        heading('<script>unsafe label</script>'),
        heading('Same'),
        heading('Same'),
      ],
    },
  };
  const html = renderToStaticMarkup(
    <DocumentView draft={copy} showOutline outlineScope="reader" />
  );
  expect(html).toContain('&lt;script&gt;unsafe label&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html.match(/href="#reader-section-/g) ?? []).toHaveLength(3);
  expect(html.match(/id="reader-section-/g) ?? []).toHaveLength(3);
  expect(html).toContain('tabindex="-1"');
});
it('opens all enclosing folds, focuses the target and scrolls without changing reader history', async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  });
  await act(() =>
    root.render(
      <DocumentView draft={draft} showOutline outlineScope="reader" />
    )
  );
  const before = window.location.href;
  await act(() =>
    [...container.querySelectorAll('nav a')]
      .find((a) => a.textContent === 'Hidden chapter')!
      .dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
  );
  expect([...container.querySelectorAll('details')].every((d) => d.open)).toBe(
    true
  );
  expect(document.activeElement?.textContent).toBe('Hidden chapter');
  expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  expect(window.location.href).toBe(before);
});
it('keeps each outline jump inside its own document', async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  });
  await act(() =>
    root.render(
      <>
        <DocumentView draft={draft} showOutline outlineScope="first" />
        <DocumentView draft={draft} showOutline outlineScope="second" />
      </>
    )
  );
  const articles = container.querySelectorAll('article');
  await act(() =>
    [...articles[1]!.querySelectorAll('nav a')]
      .find((a) => a.textContent === 'Hidden chapter')!
      .dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      )
  );
  expect(articles[0]!.querySelector('details')!.open).toBe(false);
  expect(articles[1]!.querySelector('details')!.open).toBe(true);
  expect(document.activeElement?.id.startsWith('second-')).toBe(true);
});
it('does not show an outline for fewer than two nonempty sections and reports bounded lists', () => {
  expect(
    renderToStaticMarkup(
      <DocumentView
        draft={{
          ...draft,
          content: {
            type: 'doc',
            content: [heading('Only one'), heading(' ')],
          },
        }}
        showOutline
      />
    )
  ).not.toContain('<nav');
  const html = renderToStaticMarkup(
    <DocumentView
      draft={{
        ...draft,
        content: {
          type: 'doc',
          content: Array.from({ length: 105 }, (_, i) =>
            heading(`Section ${i}`)
          ),
        },
      }}
      showOutline
    />
  );
  expect(html.match(/href="#/g) ?? []).toHaveLength(100);
  expect(html).toContain('documentOutlineLimit:100');
});
it('uses only published notebook/entry headings and falls back safely for absent selected entries', async () => {
  const published = {
    ...draft,
    title: 'Published',
    content: {
      type: 'doc',
      content: [heading('Public first'), heading('Public second')],
    },
  };
  const source = {
    id: 'entry',
    published,
    draft: {
      ...published,
      content: {
        type: 'doc',
        content: [heading('Private heading'), heading('Private second')],
      },
    },
  };
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published,
    entries: [source],
  };
  await act(() =>
    root.render(<PublicWorld world={world} initialEntry="entry" />)
  );
  expect(container.querySelector('article nav')!.textContent).toContain(
    'Public first'
  );
  expect(container.textContent).not.toContain('Private heading');
  await act(() =>
    root.render(
      <PublicWorld key="missing" world={world} initialEntry="private-missing" />
    )
  );
  expect(container.querySelector('article nav')!.textContent).toContain(
    'Public second'
  );
  expect(container.textContent).not.toContain('Private second');
});
it('replaces outline labels and targets when the selected published entry changes', async () => {
  const entry = {
    ...draft,
    title: 'Entry',
    content: {
      type: 'doc',
      content: [heading('Entry first'), heading('Entry second')],
    },
  };
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published: draft,
    entries: [{ id: 'entry', published: entry }],
  };
  await act(() => root.render(<PublicWorld world={world} />));
  expect(container.querySelector('article nav')!.textContent).toContain(
    'Opening'
  );
  await act(() =>
    [...container.querySelectorAll<HTMLButtonElement>('aside button')]
      .find((b) => b.textContent === 'Entry')!
      .click()
  );
  expect(container.querySelector('article nav')!.textContent).toContain(
    'Entry first'
  );
  expect(container.querySelector('article nav')!.textContent).not.toContain(
    'Opening'
  );
  expect(
    container.querySelector('article nav a')!.getAttribute('href')
  ).toContain('lettin-world-entry-');
});

it('keeps escaped content guidance before artwork and heading navigation', () => {
  const html = renderToStaticMarkup(
    <DocumentView
      draft={{
        ...draft,
        image: 'https://example.com/art.png',
        contentNotice: '<script>reader guidance</script>',
      }}
      showOutline
    />
  );
  expect(html).toContain('&lt;script&gt;reader guidance&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('<nav');
  expect(html.indexOf('contentNotice')).toBeLessThan(html.indexOf('<img'));
  expect(html.indexOf('contentNotice')).toBeLessThan(html.indexOf('<nav'));
});

it('retains gallery artwork and its credits while notice precedes artwork and outline', () => {
  const html = renderToStaticMarkup(
    <DocumentView
      draft={{
        ...draft,
        contentNotice: 'Read this first',
        gallery: [
          {
            image: 'https://example.test/portrait.png',
            alt: 'Portrait',
            caption: 'Illustration',
            credit: 'Artist',
          },
        ],
      }}
      showOutline
      outlineScope="public-gallery"
    />
  );
  const notice = html.indexOf('Read this first');
  expect(notice).toBeGreaterThan(-1);
  expect(html).toContain('Portrait');
  expect(html).toContain('Illustration');
  expect(html).toContain('Artist');
  expect(notice).toBeLessThan(
    html.indexOf('https://example.test/portrait.png')
  );
  expect(notice).toBeLessThan(html.indexOf('documentOutline'));
  expect(html).toContain('public-gallery');
  expect(html).toContain('data-lettin-heading');
});
