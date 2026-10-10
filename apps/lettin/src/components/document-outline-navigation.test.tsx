// @vitest-environment jsdom
import type {
  LettinDraft,
  LettinPublicWorld,
} from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { DocumentView } from './document-view';
import { PublicWorld } from './public-world';

let language: 'en' | 'vi' = 'en';
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (language === 'en' ? en : viMessages).lettin[key as keyof typeof en.lettin],
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
const heading = (text: string) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const draft: LettinDraft = {
  title: 'Published',
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
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Fold' }] },
          { type: 'detailsContent', content: [heading('Thế giới')] },
        ],
      },
    ],
  },
};
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  window.history.replaceState(
    { fixture: true },
    '',
    '/vi/worlds/world?entry=entry&secret=discard'
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  language = 'en';
  vi.restoreAllMocks();
});
const secondId = 'scope-section-0-1-1-0';
async function render(publicEntryId?: string | null, scope = 'scope') {
  await act(() =>
    root.render(
      <DocumentView
        draft={draft}
        showOutline
        outlineScope={scope}
        publicOutlineEntryId={publicEntryId}
      />
    )
  );
}
it.each(['en', 'vi'] as const)(
  'offers published entry links with the localized current-publication caveat (%s)',
  async (locale) => {
    language = locale;
    await render('entry');
    const links = container.querySelectorAll<HTMLAnchorElement>('nav a');
    expect(links[1]!.getAttribute('href')).toBe(`?entry=entry#${secondId}`);
    expect(container.textContent).toContain(
      (locale === 'en' ? en : viMessages).lettin.outlinePublishedLinksHint
    );
  }
);
it('opens folded content, retains locale/path and history state, and strips unrelated query on a plain click', async () => {
  await render('entry');
  await act(() =>
    container.querySelectorAll<HTMLAnchorElement>('nav a')[1]!.click()
  );
  expect(window.location.pathname).toBe('/vi/worlds/world');
  expect(window.location.search).toBe('?entry=entry');
  expect(window.location.hash).toBe(`#${secondId}`);
  expect(window.history.state).toEqual({ fixture: true });
  expect(container.querySelector('details')!.open).toBe(true);
  expect(document.activeElement?.id).toBe(secondId);
});
it('makes notebook links clear both the entry selection and unrelated query parameters', async () => {
  await render(null);
  await act(() =>
    container.querySelectorAll<HTMLAnchorElement>('nav a')[0]!.click()
  );
  expect(window.location.search).toBe('');
  expect(window.location.hash).toBe('#scope-section-0-0');
});
it('opens only the matching rendered heading on direct reload and later hash changes', async () => {
  window.history.replaceState(
    null,
    '',
    `/worlds/world?entry=entry#${secondId}`
  );
  await render('entry');
  expect(container.querySelector('details')!.open).toBe(true);
  expect(document.activeElement?.id).toBe(secondId);
  window.history.replaceState(
    null,
    '',
    '/worlds/world?entry=entry#scope-section-0-0'
  );
  await act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(document.activeElement?.id).toBe('scope-section-0-0');
});
it.each(['#other-section-0-0', '#scope-section-removed', '#%ZZ'])(
  'ignores invalid or out-of-scope fragments %s',
  async (hash) => {
    window.history.replaceState(null, '', `/worlds/world${hash}`);
    await render('entry');
    expect(container.querySelector('details')!.open).toBe(false);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  }
);
it('leaves modified clicks to ordinary browser link handling', async () => {
  await render('entry');
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
  });
  let browserHandled = false;
  // Observe after React's handler, then suppress jsdom's unsupported native navigation.
  document.addEventListener(
    'click',
    (click) => {
      browserHandled = !click.defaultPrevented;
      click.preventDefault();
    },
    { once: true }
  );
  await act(() =>
    container.querySelector<HTMLAnchorElement>('nav a')!.dispatchEvent(event)
  );
  expect(browserHandled).toBe(true);
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  expect(window.location.search).toContain('secret=discard');
});
it('keeps local/private-preview outline navigation from opting into public links or reload focus', async () => {
  window.history.replaceState(
    null,
    '',
    `/worlds/world?secret=retained#${secondId}`
  );
  await render();
  expect(container.querySelector('details')!.open).toBe(false);
  expect(container.querySelectorAll('nav a')[1]!.getAttribute('href')).toBe(
    `#${secondId}`
  );
  expect(container.textContent).not.toContain(
    en.lettin.outlinePublishedLinksHint
  );
  await act(() =>
    container.querySelectorAll<HTMLAnchorElement>('nav a')[1]!.click()
  );
  expect(container.querySelector('details')!.open).toBe(true);
  expect(window.location.search).toBe('?secret=retained');
  await act(() => root.render(<DocumentView draft={draft} />));
  expect(container.querySelector('nav')).toBeNull();
});
it('creates links only for a known published entry or notebook, never extra draft data or raw private query IDs', async () => {
  const source = {
    id: 'entry',
    published: draft,
    draft: {
      ...draft,
      content: { type: 'doc', content: [heading('Private heading')] },
    },
  };
  const world: LettinPublicWorld = {
    id: 'world',
    creatorId: 'creator',
    published: draft,
    entries: [source],
  };
  await act(() =>
    root.render(
      <PublicWorld world={world} initialEntry="unavailable-private" />
    )
  );
  expect(
    container
      .querySelector<HTMLAnchorElement>('article nav a')!
      .getAttribute('href')
  ).toMatch(/^\?#lettin-world-notebook-section-/);
  expect(container.textContent).not.toContain('Private heading');
  await act(() =>
    root.render(<PublicWorld key="entry" world={world} initialEntry="entry" />)
  );
  expect(
    container
      .querySelector<HTMLAnchorElement>('article nav a')!
      .getAttribute('href')
  ).toMatch(/^\?entry=entry#lettin-world-entry-section-/);
  expect(container.textContent).not.toContain('Private heading');
});
it('removes the old fragment listener after unmount', async () => {
  await render('entry');
  await act(() => root.render(null));
  window.history.replaceState(null, '', `/worlds/world#${secondId}`);
  await act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it('scopes fragment activation to one article when two published documents are rendered', async () => {
  window.history.replaceState(null, '', '/worlds/world#second-section-0-1-1-0');
  await act(() =>
    root.render(
      <>
        <DocumentView
          draft={draft}
          showOutline
          outlineScope="first"
          publicOutlineEntryId="first"
        />
        <DocumentView
          draft={draft}
          showOutline
          outlineScope="second"
          publicOutlineEntryId="second"
        />
      </>
    )
  );
  const articles = container.querySelectorAll('article');
  expect(articles[0]!.querySelector('details')!.open).toBe(false);
  expect(articles[1]!.querySelector('details')!.open).toBe(true);
  expect(document.activeElement?.id).toBe('second-section-0-1-1-0');
});
it('does not redirect a removed heading to an unrelated replacement after publication changes', async () => {
  window.history.replaceState(null, '', `/worlds/world#${secondId}`);
  await render('entry');
  const replacement = {
    ...draft,
    content: {
      type: 'doc',
      content: [heading('New first'), heading('New second')],
    },
  };
  const scroll = HTMLElement.prototype.scrollIntoView as ReturnType<
    typeof vi.fn
  >;
  scroll.mockClear();
  await act(() =>
    root.render(
      <DocumentView
        draft={replacement}
        showOutline
        outlineScope="scope"
        publicOutlineEntryId="entry"
      />
    )
  );
  expect(scroll).not.toHaveBeenCalled();
  expect(window.location.hash).toBe(`#${secondId}`);
});
