// @vitest-environment jsdom
import type { LettinDraft, LettinRecord } from '@tuturuuu/internal-api/lettin';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import {
  ReferencePublicationReview,
  referenceAvailability,
} from './reference-publication-review';

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
const draft: LettinDraft = {
  title: 'Source',
  description: '',
  image: '',
  credit: '',
  kind: 'page',
  tags: [],
  links: ['shared', 'private', 'missing-id'],
  wiki: {
    aliases: [],
    facts: [],
    relationships: [{ targetId: 'shared', kind: 'related', label: 'Repeated' }],
  },
  content: { type: 'doc', content: [] },
};
const entry = (id: string, published: boolean): LettinRecord => ({
  id,
  version: 1,
  published_at: published ? '2026-10-10' : null,
  draft: {
    ...draft,
    title: id === 'shared' ? '<img src=x onerror=bad>' : 'Private target title',
    links: [],
  },
  published: published
    ? { ...draft, title: 'Published target title', links: [] }
    : null,
});
const entries = [entry('shared', true), entry('private', false)];
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.render(null));
});

it('deduplicates links and relationships without mutating source records', () => {
  const before = structuredClone({ draft, entries });
  expect(referenceAvailability(draft, entries)).toEqual([
    { id: 'shared', title: '<img src=x onerror=bad>', state: 'published' },
    { id: 'private', title: 'Private target title', state: 'private' },
    { id: 'missing-id', title: undefined, state: 'unavailable' },
  ]);
  expect({ draft, entries }).toEqual(before);
  expect(
    referenceAvailability({ ...draft, links: [], wiki: undefined }, entries)
  ).toEqual([]);
  expect(
    referenceAvailability(
      {
        ...draft,
        links: [],
        wiki: {
          ...draft.wiki!,
          relationships: [
            {
              targetId: 'private',
              kind: 'related',
              label: 'Relationship only',
            },
          ],
        },
      },
      entries
    )
  ).toHaveLength(1);
});
it.each(['en', 'vi'] as const)(
  'shows localized private availability and notebook boundaries in %s without missing IDs or unsafe markup',
  async (locale) => {
    state.locale = locale;
    const messages = locale === 'en' ? en.lettin : viMessages.lettin;
    await act(() =>
      root.render(
        <ReferencePublicationReview draft={draft} entries={entries} />
      )
    );
    expect(container.querySelector('section')?.getAttribute('aria-label')).toBe(
      messages.referenceReviewTitle
    );
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.textContent).toContain(messages.referenceReviewHint);
    expect(container.textContent).toContain(messages.referenceReviewPublished);
    expect(container.textContent).toContain(messages.referenceReviewPrivate);
    expect(container.textContent).toContain(
      messages.referenceReviewUnavailable
    );
    expect(container.textContent).not.toContain('missing-id');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    await act(() =>
      root.render(
        <ReferencePublicationReview
          draft={draft}
          entries={[entry('shared', false)]}
        />
      )
    );
    expect(container.textContent).not.toContain(
      messages.referenceReviewPublished
    );
    expect(container.querySelectorAll('li')).toHaveLength(3);
  }
);
it('renders no review for an item without references', async () => {
  await act(() =>
    root.render(
      <ReferencePublicationReview
        draft={{ ...draft, links: [], wiki: undefined }}
        entries={entries}
      />
    )
  );
  expect(container.childElementCount).toBe(0);
});
