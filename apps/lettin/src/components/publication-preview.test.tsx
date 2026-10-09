// @vitest-environment jsdom
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { PublicationPreview } from './publication-preview';

const state = vi.hoisted(() => ({
  messages: {} as Record<string, string>,
  onOpenChange: (_open: boolean) => {},
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => state.messages[key] ?? key,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/dialog', () => {
  const Container = ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  );
  return {
    ...Object.fromEntries(
      [
        'DialogContent',
        'DialogHeader',
        'DialogDescription',
        'DialogTitle',
        'DialogTrigger',
      ].map((key) => [key, Container])
    ),
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange: (open: boolean) => void;
    }) => {
      state.onOpenChange = onOpenChange;
      return <div>{children}</div>;
    },
  };
});

const draft: LettinDraft = {
  title: 'Private revised title',
  description: 'Private draft description',
  contentNotice: 'Draft warning',
  image: '',
  credit: 'Draft credit',
  kind: 'page',
  tags: [],
  links: [],
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Private revised body' }],
      },
    ],
  },
};
const published: LettinDraft = {
  ...draft,
  title: 'Published title',
  description: 'Published description',
  contentNotice: 'Published warning',
  credit: 'Published credit',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Published body' }],
      },
    ],
  },
};
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
});
const snapshotButton = () =>
  [...container.querySelectorAll('button')].find(
    (button) => button.textContent === state.messages.previewPublishedSnapshot
  )!;
const documentText = () => container.querySelector('article')!.textContent!;

it.each([en.lettin, viMessages.lettin])(
  'switches privately between local draft and saved publication with localized status',
  async (messages) => {
    state.messages = messages;
    await act(async () =>
      root.render(<PublicationPreview draft={draft} published={published} />)
    );
    expect(container.textContent).toContain(messages.previewVersionHint);
    expect(container.textContent).not.toContain(messages.previewHint);
    expect(documentText()).toContain('Private revised body');
    expect(documentText()).not.toContain('Published body');
    expect(
      container.querySelector('fieldset')?.getAttribute('aria-label')
    ).toBe(messages.previewVersion);
    await act(async () => snapshotButton().click());
    expect(snapshotButton().getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain(messages.previewVersionHint);
    expect(container.textContent).not.toContain(messages.previewHint);
    expect(documentText()).toContain('Published title');
    expect(documentText()).toContain('Published body');
    expect(documentText()).toContain('Published warning');
    expect(documentText()).toContain('Published credit');
    expect(documentText()).not.toContain('Private revised');
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      messages.previewPublishedHint
    );
    await act(async () => state.onOpenChange(false));
    await act(async () => state.onOpenChange(true));
    expect(documentText()).toContain('Private revised body');
    expect(snapshotButton().getAttribute('aria-pressed')).toBe('false');
  }
);

it('disables the publication view for an unpublished record', async () => {
  state.messages = en.lettin;
  await act(async () =>
    root.render(<PublicationPreview draft={draft} published={null} />)
  );
  expect(snapshotButton().disabled).toBe(true);
  await act(async () => snapshotButton().click());
  expect(documentText()).toContain('Private revised body');
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    en.lettin.previewUnpublishedHint
  );
});

it('refreshes the displayed snapshot and safely falls back after unpublishing', async () => {
  state.messages = en.lettin;
  await act(async () =>
    root.render(<PublicationPreview draft={draft} published={published} />)
  );
  await act(async () => snapshotButton().click());
  await act(async () =>
    root.render(
      <PublicationPreview
        draft={draft}
        published={{ ...published, title: 'Republished title' }}
      />
    )
  );
  expect(documentText()).toContain('Republished title');
  await act(async () =>
    root.render(<PublicationPreview draft={draft} published={null} />)
  );
  expect(documentText()).toContain('Private revised title');
  expect(snapshotButton().getAttribute('aria-pressed')).toBe('false');
  expect(snapshotButton().disabled).toBe(true);
});
