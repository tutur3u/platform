// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { QuickNote } from './quick-note';

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  errorMessage: null as string | null,
  locale: null as 'en' | 'vi' | null,
  dialogChange: (_open: boolean) => {},
}));
vi.mock('./use-lettin', () => ({ useLettinMutation: () => state }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    state.locale
      ? (state.locale === 'en' ? en : viMessages).lettin[
          key as keyof typeof en.lettin
        ]
      : key,
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
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
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
      ].map((name) => [name, Container])
    ),
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: import('react').ReactNode;
      onOpenChange: (open: boolean) => void;
    }) => {
      state.dialogChange = onOpenChange;
      return <div>{children}</div>;
    },
  };
});
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
  state.isPending = false;
  state.errorMessage = null;
  state.locale = null;
});
async function render(
  disabled = false,
  onCreated = vi.fn(),
  worldId = 'notebook'
) {
  await act(async () =>
    root.render(
      <QuickNote
        key={worldId}
        wsId="workspace"
        worldId={worldId}
        disabled={disabled}
        onCreated={onCreated}
      />
    )
  );
  return onCreated;
}
async function fill(title = 'Idea', body = 'Private text') {
  await act(async () => {
    const input = container.querySelector('input')!;
    const area = container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, title);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )!.set!.call(area, body);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function selectKind(kind: string) {
  await act(async () => {
    const select = container.querySelector('select')!;
    select.value = kind;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
it('creates only an explicitly submitted private entry and requires a separate open action', async () => {
  state.mutateAsync.mockResolvedValueOnce({ id: 'note' });
  const onCreated = await render();
  await fill();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  await submit();
  expect(state.mutateAsync).toHaveBeenCalledTimes(1);
  expect(state.mutateAsync.mock.calls[0]?.[0]).toMatchObject({
    action: 'createEntry',
    worldId: 'notebook',
    draft: { title: 'Idea', kind: 'page', links: [] },
  });
  expect(onCreated).not.toHaveBeenCalled();
  expect(container.querySelector('input')!.value).toBe('');
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'openQuickNote')!
      .click()
  );
  expect(onCreated).toHaveBeenCalledWith('note');
});
it('preserves failed input and leaves retries explicit', async () => {
  state.mutateAsync.mockImplementationOnce(async () => {
    state.errorMessage = 'Failure';
    throw new Error('Failure');
  });
  await render();
  await fill();
  await selectKind('character');
  await submit();
  expect(state.mutateAsync).toHaveBeenCalledTimes(1);
  expect(container.querySelector('select')!.value).toBe('character');
  expect(container.querySelector('input')!.value).toBe('Idea');
  expect(container.querySelector('textarea')!.value).toBe('Private text');
  expect(container.querySelector('[role=alert]')?.textContent).toBe('Failure');
});
it('fences rapid repeated submit and preserves dirty-navigation blocking after completion', async () => {
  let resolve!: (value: { id: string }) => void;
  state.mutateAsync.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const onCreated = await render();
  await fill();
  await act(async () => {
    const form = container.querySelector('form')!;
    for (let i = 0; i < 2; i++)
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
  });
  expect(state.mutateAsync).toHaveBeenCalledTimes(1);
  expect(container.querySelector('textarea')!.disabled).toBe(true);
  expect(container.querySelector('select')!.disabled).toBe(true);
  await render(true, onCreated);
  await act(async () => resolve({ id: 'note' }));
  const open = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'openQuickNote'
  )!;
  expect(open.disabled).toBe(true);
  open.click();
  expect(onCreated).not.toHaveBeenCalled();
});
it('blocks invalid or dirty commands and resets local capture on notebook-context replacement', async () => {
  await render();
  await fill('', 'text');
  await submit();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  await render(true);
  await fill();
  await submit();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  await selectKind('story');
  expect(container.querySelector('select')!.disabled).toBe(true);
  await render(false, vi.fn(), 'other-notebook');
  expect(container.querySelector('select')!.value).toBe('page');
  expect(container.querySelector('input')!.value).toBe('');
  expect(container.querySelector('textarea')!.value).toBe('');
});

it.each(['en', 'vi'] as const)(
  'labels and submits explicit typed capture in %s, then restores the page default',
  async (locale) => {
    state.locale = locale;
    state.mutateAsync.mockResolvedValueOnce({ id: 'typed-note' });
    await render();
    const messages = locale === 'en' ? en.lettin : viMessages.lettin;
    const select = container.querySelector('select')!;
    expect(select.getAttribute('aria-label')).toBe(messages.kind);
    expect(select.value).toBe('page');
    expect(
      [...select.options].find((o) => o.value === 'character')!.textContent
    ).toBe(messages.kindcharacter);
    await selectKind('character');
    await fill();
    expect(state.mutateAsync).not.toHaveBeenCalled();
    await submit();
    expect(state.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'createEntry',
        worldId: 'notebook',
        draft: expect.objectContaining({
          kind: 'character',
          links: [],
          tags: [],
        }),
      })
    );
    expect(container.querySelector('select')!.value).toBe('page');
  }
);

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (item) => item.textContent === label
  )!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
it('reviews and cancels discard without saving or changing private input', async () => {
  await render();
  expect(button('discardQuickNoteDraft').disabled).toBe(true);
  await fill();
  await selectKind('character');
  await click('discardQuickNoteDraft');
  expect(container.querySelector('textarea')!.disabled).toBe(true);
  expect(button('saveQuickNote').disabled).toBe(true);
  await submit();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  await click('keepQuickNoteDraft');
  expect(container.querySelector('input')!.value).toBe('Idea');
  expect(container.querySelector('textarea')!.value).toBe('Private text');
  expect(container.querySelector('select')!.value).toBe('character');
  expect(button('saveQuickNote').disabled).toBe(false);
});
it('clears only local input after confirmation, including a kind-only draft', async () => {
  await render();
  await selectKind('story');
  expect(button('discardQuickNoteDraft').disabled).toBe(false);
  await click('discardQuickNoteDraft');
  await click('confirmQuickNoteDiscard');
  expect(container.querySelector('select')!.value).toBe('page');
  await fill();
  await click('discardQuickNoteDraft');
  await click('confirmQuickNoteDiscard');
  expect(container.querySelector('input')!.value).toBe('');
  expect(container.querySelector('textarea')!.value).toBe('');
  expect(button('discardQuickNoteDraft').disabled).toBe(true);
  expect(state.mutateAsync).not.toHaveBeenCalled();
  expect(state.reset).toHaveBeenCalledTimes(2);
});
it('closing and reopening preserves the draft and dismisses discard review', async () => {
  await render();
  await fill();
  await click('discardQuickNoteDraft');
  await act(async () => state.dialogChange(false));
  await act(async () => state.dialogChange(true));
  expect(button('confirmQuickNoteDiscard')).toBeUndefined();
  expect(container.querySelector('textarea')!.value).toBe('Private text');
  expect(container.querySelector('input')!.disabled).toBe(false);
  expect(state.mutateAsync).not.toHaveBeenCalled();
});
it('blocks confirmed discard when editor access is disabled during review', async () => {
  await render();
  await fill();
  await click('discardQuickNoteDraft');
  await render(true);
  expect(button('confirmQuickNoteDiscard').disabled).toBe(true);
  await click('confirmQuickNoteDiscard');
  expect(container.querySelector('textarea')!.value).toBe('Private text');
  await submit();
  expect(state.mutateAsync).not.toHaveBeenCalled();
});
it('blocks discard during creation and preserves the saved entry after later draft discard', async () => {
  let resolve!: (value: { id: string }) => void;
  state.mutateAsync.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const onCreated = await render();
  await fill();
  await submit();
  expect(button('discardQuickNoteDraft').disabled).toBe(true);
  await click('discardQuickNoteDraft');
  expect(button('confirmQuickNoteDiscard')).toBeUndefined();
  await act(async () => resolve({ id: 'saved-note' }));
  await fill('Second draft', 'Unsubmitted text');
  await click('discardQuickNoteDraft');
  await click('confirmQuickNoteDiscard');
  await click('openQuickNote');
  expect(onCreated).toHaveBeenCalledWith('saved-note');
  expect(state.mutateAsync).toHaveBeenCalledTimes(1);
});
it.each(['en', 'vi'] as const)(
  'renders explicit discard choices in %s',
  async (locale) => {
    state.locale = locale;
    const messages = locale === 'en' ? en.lettin : viMessages.lettin;
    await render();
    await fill();
    await click(messages.discardQuickNoteDraft);
    expect(container.textContent).toContain(messages.quickNoteDiscardTitle);
    expect(container.textContent).toContain(messages.quickNoteDiscardHint);
    await click(messages.keepQuickNoteDraft);
    expect(container.querySelector('textarea')!.value).toBe('Private text');
  }
);
