// @vitest-environment jsdom
import type {
  LettinNode,
  LettinPublicWorld,
} from '@tuturuuu/internal-api/lettin';
import { NextIntlClientProvider } from 'next-intl';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { DocumentView } from './document-view';
import { PublicWorld } from './public-world';
import { PublishedReadingStatistics } from './published-reading-statistics';
import { createStarterDraft } from './starter-drafts';

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

const draft = (body: string) => ({
  ...createStarterDraft('Metadata title is excluded', 'blank', (key) => key),
  description: 'Metadata description is excluded too',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
  },
});

for (const [locale, messages] of [
  ['en', en],
  ['vi', vietnamese],
] as const) {
  it(`counts only the selected published body and switches back to the notebook in ${locale}`, async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const source = {
      id: 'entry',
      published: { ...draft('Chào bạn'), title: 'Published entry' },
      draft: draft('Private secret text must never be counted'),
    };
    const world: LettinPublicWorld = {
      id: 'world',
      creatorId: 'creator',
      published: draft('One two'),
      entries: [source],
    };
    const provider = (child: React.ReactNode) => (
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        {child}
      </NextIntlClientProvider>
    );
    const counts = () =>
      [
        ...container.querySelectorAll(
          `section[aria-label="${messages.lettin.publishedReadingStatistics}"] dd`
        ),
      ].map((node) => node.textContent);
    try {
      await act(() => root.render(provider(<PublicWorld world={world} />)));
      expect(counts()).toEqual(['2', '6']);
      expect(container.textContent).toContain(
        messages.lettin.publishedReadingStatisticsHint
      );
      const entryButton = [...container.querySelectorAll('nav button')].find(
        (node) => node.textContent === 'Published entry'
      )!;
      await act(() =>
        entryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      );
      expect(counts()).toEqual(['2', '7']);
      expect(container.textContent).not.toContain('Private secret');
      expect(
        container.querySelector('input[type="number"], progress')
      ).toBeNull();
      await act(() =>
        container
          .querySelector('aside button')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      );
      expect(counts()).toEqual(['2', '6']);
      await act(() =>
        root.render(
          provider(
            <PublicWorld world={world} initialEntry="missing" key="missing" />
          )
        )
      );
      expect(counts()).toEqual(['2', '6']);
      await act(() =>
        root.render(provider(<DocumentView draft={source.draft} showOutline />))
      );
      expect(counts()).toEqual([]);
    } finally {
      await act(() => root.unmount());
    }
  });

  it(`marks bounded body counts as partial and clears the warning for a new body in ${locale}`, async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    let deep: LettinNode = { type: 'text', text: 'Beyond depth limit' };
    for (let index = 0; index < 27; index++)
      deep = { type: 'blockquote', content: [deep] };
    const render = (content: LettinNode) => (
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <PublishedReadingStatistics content={content} />
      </NextIntlClientProvider>
    );
    try {
      await act(() => root.render(render(deep)));
      expect(container.textContent).toContain(
        messages.lettin.writingStatisticsPartial
      );
      await act(() => root.render(render({ type: 'doc', content: [] })));
      expect(container.textContent).not.toContain(
        messages.lettin.writingStatisticsPartial
      );
      expect(
        [...container.querySelectorAll('dd')].map((node) => node.textContent)
      ).toEqual(['0', '0']);
    } finally {
      await act(() => root.unmount());
    }
  });
}
