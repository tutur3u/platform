// @vitest-environment jsdom
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { WorkProgressSummary } from './work-progress-summary';

const entry = (
  id: string,
  progress?: LettinRecord['draft']['workProgress']
): LettinRecord => ({
  id,
  version: 1,
  published: null,
  published_at: null,
  draft: {
    title: 'Private title',
    kind: 'character',
    description: '',
    image: '',
    credit: '',
    tags: [],
    links: [],
    content: { type: 'doc' },
    workProgress: progress,
  },
});
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.render(null));
});
const render = async (entries: LettinRecord[], locale = 'en') => {
  const messages = locale === 'en' ? en : vi;
  await act(() =>
    root.render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <WorkProgressSummary entries={entries} />
      </NextIntlClientProvider>
    )
  );
  return messages.lettin;
};
const countFor = (label: string) =>
  [...container.querySelectorAll('dt')].find((dt) => dt.textContent === label)
    ?.nextElementSibling?.textContent;

it.each(['en', 'vi'])(
  'counts saved stages including historical defaults and zero counts in %s',
  async (locale) => {
    const records = [
      entry('legacy'),
      entry('started', 'drafting'),
      entry('ready', 'ready'),
    ];
    records[1]!.published = { ...records[1]!.draft, workProgress: 'ready' };
    const before = JSON.stringify(records);
    const t = await render(records, locale);
    expect(container.querySelector('section')?.getAttribute('aria-label')).toBe(
      t.workProgressSummary
    );
    expect(countFor(t.workProgress_unstarted)).toBe('1');
    expect(countFor(t.workProgress_drafting)).toBe('1');
    expect(countFor(t.workProgress_revising)).toBe('0');
    expect(countFor(t.workProgress_ready)).toBe('1');
    expect(container.textContent).toContain(t.workProgressSummaryHint);
    expect(container.textContent).not.toContain('Private title');
    expect(container.querySelectorAll('button,input,select,a')).toHaveLength(0);
    expect(JSON.stringify(records)).toBe(before);
  }
);
it('renders all four zero stages for an empty notebook and refreshes from saved entries', async () => {
  const t = await render([]);
  expect(
    [...container.querySelectorAll('dd')].map((dd) => dd.textContent)
  ).toEqual(['0', '0', '0', '0']);
  await render([entry('saved', 'revising')]);
  expect(countFor(t.workProgress_revising)).toBe('1');
  expect(countFor(t.workProgress_ready)).toBe('0');
});
