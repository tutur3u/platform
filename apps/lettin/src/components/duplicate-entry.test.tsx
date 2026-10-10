// @vitest-environment jsdom
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { DuplicateEntry } from './duplicate-entry';

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  messages: null as Record<string, string> | null,
  onOpenChange: (_value: boolean) => {},
  reset: vi.fn(),
  isPending: false,
  errorMessage: null as string | null,
}));
vi.mock('./use-lettin', () => ({ useLettinMutation: () => state }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => state.messages?.[key] ?? key,
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
vi.mock('@tuturuuu/ui/dialog', () => {
  const Container = ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  );
  const parts = Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogHeader',
      'DialogDescription',
      'DialogTitle',
      'DialogTrigger',
    ].map((name) => [name, Container])
  );
  return {
    ...parts,
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange: (value: boolean) => void;
    }) => {
      state.onOpenChange = onOpenChange;
      return <div>{children}</div>;
    },
  };
});
const record: LettinRecord = {
  id: 'source',
  version: 7,
  published: null,
  published_at: null,
  draft: {
    title: 'Original',
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
  state.messages = null;
  state.isPending = false;
  state.errorMessage = null;
});
async function render(disabled = false, onCreated = vi.fn(), source = record) {
  await act(async () =>
    root.render(
      <DuplicateEntry
        wsId="workspace"
        worldId="notebook"
        record={source}
        disabled={disabled}
        onCreated={onCreated}
      />
    )
  );
  return onCreated;
}
async function title(value = '  New title  ') {
  await act(async () => {
    const input = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function send() {
  container
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
it('submits only source identifiers, saved revision and explicit title, with separate navigation', async () => {
  state.mutateAsync.mockResolvedValue({ id: 'copy' });
  const onCreated = await render();
  await title();
  await act(async () => send());
  expect(state.mutateAsync).toHaveBeenCalledWith({
    action: 'duplicateEntry',
    worldId: 'notebook',
    entryId: 'source',
    version: 7,
    title: 'New title',
  });
  expect(onCreated).not.toHaveBeenCalled();
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'openEntryCopy')!
      .click()
  );
  expect(onCreated).toHaveBeenCalledWith('copy');
});
it('blocks duplication for unsaved edits or blank title', async () => {
  await render();
  await act(async () => send());
  expect(state.mutateAsync).not.toHaveBeenCalled();
  await title();
  await render(true);
  await act(async () => send());
  expect(state.mutateAsync).not.toHaveBeenCalled();
});
it('fences duplicate submits even before pending state renders and preserves later dirty edits', async () => {
  let resolve!: (value: { id: string }) => void;
  state.mutateAsync.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const onCreated = await render();
  await title();
  await act(async () => {
    send();
    send();
  });
  expect(state.mutateAsync).toHaveBeenCalledTimes(1);
  await render(true, onCreated);
  await act(async () => resolve({ id: 'copy' }));
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'openEntryCopy'
  )!;
  expect(button.disabled).toBe(true);
  expect(onCreated).not.toHaveBeenCalled();
});
it('retains title and exposes mutation errors after a failed request', async () => {
  state.mutateAsync.mockRejectedValue(new Error('conflict'));
  await render();
  await title();
  await act(async () => send());
  state.errorMessage = 'conflict';
  await render();
  expect(container.querySelector('input')!.value).toBe('  New title  ');
  expect(container.querySelector('[role="alert"]')!.textContent).toBe(
    'conflict'
  );
});

it('links a source only after explicit consent and clears the choice on reopening', async () => {
  state.mutateAsync.mockResolvedValue({ id: 'copy' });
  await render();
  const checkbox = () =>
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(checkbox().checked).toBe(false);
  await title();
  await act(async () => checkbox().click());
  expect(checkbox().checked).toBe(true);
  await act(async () => send());
  expect(state.mutateAsync).toHaveBeenLastCalledWith(
    expect.objectContaining({ linkSource: true })
  );
  await act(async () => state.onOpenChange(true));
  expect(checkbox().checked).toBe(false);
  await title('Another copy');
  await act(async () => send());
  expect(state.mutateAsync.mock.calls.at(-1)![0]).not.toHaveProperty(
    'linkSource'
  );
});

it('preserves consent after a failed request and disables it for dirty or pending copies', async () => {
  state.mutateAsync.mockRejectedValue(new Error('conflict'));
  await render();
  await title();
  const checkbox = () =>
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => checkbox().click());
  await act(async () => send());
  expect(checkbox().checked).toBe(true);
  await render(true);
  expect(checkbox().disabled).toBe(true);
  state.isPending = true;
  await render(false);
  expect(checkbox().disabled).toBe(true);
});

it.each([en.lettin, viMessages.lettin])(
  'labels source-reference consent and publication boundaries in both languages',
  async (messages) => {
    state.messages = messages;
    await render();
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    )!;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.closest('label')!.textContent).toContain(
      messages.copyLinkSource
    );
    expect(checkbox.closest('label')!.textContent).toContain(
      messages.copyLinkSourceHint
    );
    expect(state.mutateAsync).not.toHaveBeenCalled();
  }
);

async function contextInput(value: string) {
  await act(() => {
    const input = container.querySelectorAll('input')[1]!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it.each([en.lettin, viMessages.lettin])(
  'adds only an explicitly entered localized character context, without opting into source linking',
  async (messages) => {
    state.messages = messages;
    state.mutateAsync.mockResolvedValue({ id: 'copy' });
    await render(false, vi.fn(), {
      ...record,
      draft: { ...record.draft, kind: 'character' },
    });
    expect(container.querySelectorAll('input')[1]?.value).toBe('');
    expect(container.textContent).toContain(messages.copyCharacterContextHint);
    await title('Variant');
    await contextInput('  Alternate era  ');
    await act(() => send());
    expect(state.mutateAsync).toHaveBeenCalledWith({
      action: 'duplicateEntry',
      worldId: 'notebook',
      entryId: 'source',
      version: 7,
      title: 'Variant',
      contextFact: {
        label: messages.copyCharacterContextFact,
        value: 'Alternate era',
      },
    });
  }
);
it('preserves context after a failed copy and clears it on a new confirmation', async () => {
  state.mutateAsync.mockRejectedValueOnce(new Error('Conflict'));
  await render(false, vi.fn(), {
    ...record,
    draft: { ...record.draft, kind: 'character' },
  });
  await title('Variant');
  await contextInput('Private context');
  await act(() => send());
  expect(container.querySelectorAll('input')[1]?.value).toBe('Private context');
  await act(() => state.onOpenChange(false));
  await act(() => state.onOpenChange(true));
  expect(container.querySelectorAll('input')[1]?.value).toBe('');
});
it('blocks context at 40 facts but still allows a normal private copy after clearing it', async () => {
  const facts = Array.from({ length: 40 }, (_, i) => ({
    label: String(i),
    value: '',
  }));
  state.mutateAsync.mockResolvedValue({ id: 'copy' });
  await render(false, vi.fn(), {
    ...record,
    draft: {
      ...record.draft,
      kind: 'character',
      wiki: { aliases: [], facts, relationships: [] },
    },
  });
  await title('Copy');
  await contextInput('Context');
  await act(() => send());
  expect(state.mutateAsync).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'copyCharacterContextLimit'
  );
  await contextInput('');
  await act(() => send());
  expect(state.mutateAsync.mock.lastCall?.[0]).not.toHaveProperty(
    'contextFact'
  );
  expect(state.mutateAsync.mock.lastCall?.[0]).not.toHaveProperty('linkSource');
});
