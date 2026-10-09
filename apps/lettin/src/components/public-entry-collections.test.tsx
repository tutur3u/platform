// @vitest-environment jsdom
import type {
  LettinDraft,
  LettinPublicWorld,
} from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { PublicWorld } from './public-world';
import { createStarterDraft } from './starter-drafts';

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'vi' }));
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: () =>
      actual.createTranslator({
        locale: state.locale,
        messages: state.locale === 'en' ? en : viMessages,
        namespace: 'lettin',
      }),
  };
});
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
const draft = (title: string, kind: LettinDraft['kind']): LettinDraft => ({
  ...createStarterDraft(title, 'blank', (key) => key),
  kind,
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Published body' }],
      },
    ],
  },
});
const world: LettinPublicWorld = {
  id: 'notebook',
  creatorId: 'creator',
  published: draft('Notebook introduction', 'world'),
  entries: [
    {
      id: 'hero',
      published: {
        ...draft('Published character', 'character'),
        contentNotice: 'Published notice',
        wiki: {
          aliases: ['Đồng Minh'],
          facts: [],
          relationships: [
            {
              targetId: 'story',
              kind: 'appears',
              label: 'Published connection',
            },
            {
              targetId: 'private-only',
              kind: 'friend',
              label: 'Unavailable connection',
            },
          ],
        },
      },
    },
    { id: 'story', published: draft('Published story', 'story') },
    {
      id: 'late',
      published: {
        ...draft('Later event', 'event'),
        wiki: {
          aliases: [],
          facts: [],
          relationships: [],
          chronology: { label: 'Day 2', era: 'Era', order: 2 },
        },
      },
    },
    {
      id: 'early',
      published: {
        ...draft('Earlier event', 'event'),
        wiki: {
          aliases: [],
          facts: [],
          relationships: [],
          chronology: { label: 'Day 1', era: 'Era', order: 1 },
        },
      },
    },
  ],
};
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  state.locale = 'en';
});
async function render(initialEntry?: string, value = world) {
  window.history.replaceState(null, '', '/worlds/notebook');
  await act(() =>
    root.render(<PublicWorld world={value} initialEntry={initialEntry} />)
  );
}
async function section(value: string) {
  await act(() => {
    const select = container.querySelector(
      'aside select'
    )! as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function search(value: string) {
  await act(() => {
    const input = container.querySelector('aside input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it.each(['en', 'vi'] as const)(
  'opens translated character cards with published notice and entry counts in %s',
  async (locale) => {
    state.locale = locale;
    await render();
    expect(container.querySelector('article h1')?.textContent).toBe(
      'Notebook introduction'
    );
    await section('characters');
    expect(container.querySelector('article')).toBeNull();
    expect(container.querySelectorAll('.wiki-entry-card')).toHaveLength(1);
    expect(container.querySelector('.wiki-entry-card')?.textContent).toContain(
      'Published notice'
    );
    expect(container.querySelector('.wiki-entry-card')?.textContent).toContain(
      'Đồng Minh'
    );
    const messages = locale === 'en' ? en.lettin : viMessages.lettin;
    expect(container.querySelector('h1')?.textContent).toBe(
      messages.sectioncharacters
    );
    expect(container.querySelector('[role=status]')?.textContent).toBe(
      locale === 'en' ? '1 matching entry' : '1 mục phù hợp'
    );
  }
);
it('composes published alias search and kind, then clears empty filters back to the notebook', async () => {
  await render();
  await section('characters');
  await search('đỒng minh');
  expect(container.querySelectorAll('.wiki-entry-card')).toHaveLength(1);
  await search('missing');
  expect(container.querySelectorAll('.wiki-entry-card')).toHaveLength(0);
  expect(container.querySelector('[role=status]')?.textContent).toBe(
    'No matching entries'
  );
  expect(container.querySelector('aside')?.textContent).toContain(
    en.lettin.noReadingMatches
  );
  await act(() =>
    [...container.querySelectorAll('aside button')]
      .find((b) => b.textContent === en.lettin.clearReadingFilters)!
      .click()
  );
  expect(
    (container.querySelector('aside input') as HTMLInputElement).value
  ).toBe('');
  expect(
    (container.querySelector('aside select') as HTMLSelectElement).value
  ).toBe('overview');
  expect(container.querySelector('article h1')?.textContent).toBe(
    'Notebook introduction'
  );
});
it('opens a card using the existing entry URL and retains collection filters when returning', async () => {
  await render();
  await section('stories');
  await act(() =>
    (container.querySelector('.wiki-entry-card') as HTMLButtonElement).click()
  );
  expect(container.querySelector('article h1')?.textContent).toBe(
    'Published story'
  );
  expect(new URL(window.location.href).searchParams.get('entry')).toBe('story');
  await act(() =>
    (container.querySelector('aside button') as HTMLButtonElement).click()
  );
  expect(new URL(window.location.href).searchParams.has('entry')).toBe(false);
  expect(container.querySelectorAll('.wiki-entry-card')).toHaveLength(1);
});
it('uses published snapshots even when an unexpected private draft is attached to a record', async () => {
  const value = {
    ...world,
    entries: world.entries.map((entry) => ({
      ...entry,
      draft: draft('Private changed title', 'location'),
    })),
  };
  await render('hero', value);
  expect(container.querySelector('article h1')?.textContent).toBe(
    'Published character'
  );
  expect(container.textContent).not.toContain('Private changed title');
  await section('characters');
  expect(container.querySelectorAll('.wiki-entry-card')).toHaveLength(1);
  expect(container.textContent).not.toContain('Private changed title');
});
it('retains chronological browsing', async () => {
  await render();
  await section('timeline');
  expect(
    [...container.querySelectorAll('.wiki-timeline li h3')].map(
      (h) => h.textContent
    )
  ).toEqual(['Earlier event', 'Later event']);
  expect(container.querySelector('[role=status]')?.textContent).toBe(
    '2 matching entries'
  );
});
it('retains relationship-label search and never labels its entry sidebar as a connection count', async () => {
  await render();
  await section('relationships');
  await search('Published connection');
  expect(container.querySelectorAll('.wiki-connection')).toHaveLength(1);
  expect(container.querySelector('.wiki-connection')?.textContent).toContain(
    'Published character'
  );
  expect(container.querySelector('.wiki-connection')?.textContent).toContain(
    'Published story'
  );
  expect(container.querySelector('[role=status]')).toBeNull();
  expect(container.textContent).not.toContain('Unavailable connection');
});
