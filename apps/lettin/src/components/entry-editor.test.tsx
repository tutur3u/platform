// @vitest-environment jsdom
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EntryEditor } from './entry-editor';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('./use-lettin', () => ({
  useLettinMutation: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false }),
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  uploadLettinArtwork: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
}));
vi.mock('@tuturuuu/ui/dialog', () => {
  const Container = ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  );
  return Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogDescription',
      'DialogHeader',
      'DialogTitle',
      'DialogTrigger',
    ].map((name) => [name, Container])
  );
});
vi.mock('./document-view', () => ({ DocumentView: () => null }));
vi.mock('./rich-editor', () => ({
  RichEditor: ({
    onChange,
  }: {
    onChange: (content: { type: string; text: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ type: 'text', text: 'New typing' })}
    >
      type
    </button>
  ),
}));

const record: LettinRecord = {
  id: 'world',
  version: 1,
  published: null,
  published_at: null,
  draft: {
    title: 'World',
    description: '',
    image: '',
    credit: '',
    kind: 'page',
    tags: [],
    links: [],
    content: { type: 'doc' },
  },
};
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
});
const click = async (text: string) => {
  const button = [...container.querySelectorAll('button')].find(
    (el) => el.textContent === text
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
};

it('keeps typing during a pending save dirty and saves it with the next revision', async () => {
  let finishSave!: () => void;
  mutateAsync.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      })
  );
  const onDirty = vi.fn();
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  await click('type');
  await click('saveDraft');
  await click('type');
  await act(async () => finishSave());
  expect(onDirty).not.toHaveBeenCalledWith(false);
  expect(container.textContent).toContain('unsaved');
  expect(mutateAsync.mock.calls[0]?.[0].version).toBe(1);

  mutateAsync.mockResolvedValueOnce({ id: 'world' });
  await click('saveDraft');
  expect(mutateAsync.mock.calls[1]?.[0].version).toBe(2);
  expect(onDirty).toHaveBeenLastCalledWith(false);
});

it('preserves local content and revision when a save conflicts', async () => {
  mutateAsync.mockRejectedValueOnce(new Error('Revision conflict'));
  const onDirty = vi.fn();
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  await click('type');
  await click('saveDraft');
  expect(onDirty).not.toHaveBeenCalledWith(false);
  expect(container.textContent).toContain('unsaved');
  mutateAsync.mockResolvedValueOnce({ id: 'world' });
  await click('saveDraft');
  expect(mutateAsync.mock.calls[1]?.[0].version).toBe(1);
  expect(mutateAsync.mock.calls[1]?.[0].draft.content.text).toBe('New typing');
});
