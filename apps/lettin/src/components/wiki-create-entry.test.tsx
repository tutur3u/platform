// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WikiCreateEntry } from './wiki-create-entry';

const state = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('./use-lettin', () => ({ useLettinMutation: () => state }));
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
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
  state.isPending = false;
});
async function render(disabled = false) {
  const onCreated = vi.fn();
  await act(async () =>
    root.render(
      <WikiCreateEntry
        wsId="workspace"
        worldId="world"
        defaultKind="character"
        disabled={disabled}
        onCreated={onCreated}
      />
    )
  );
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, '  Hero  ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return onCreated;
}
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
}
it('creates a blank character by default through the existing command', async () => {
  state.mutateAsync.mockResolvedValue({ id: 'created' });
  const onCreated = await render();
  await submit();
  expect(state.mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'createEntry',
      worldId: 'world',
      draft: expect.objectContaining({
        title: 'Hero',
        kind: 'character',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      }),
    })
  );
  expect(onCreated).toHaveBeenCalledWith('created');
  expect(container.querySelector('input')!.value).toBe('');
});
it('uses the latest kind after opting into an outline', async () => {
  state.mutateAsync.mockResolvedValue({ id: 'created' });
  await render();
  const selects = container.querySelectorAll('select');
  await choose(selects[1]!, 'structured');
  await choose(selects[0]!, 'location');
  await submit();
  const draft = state.mutateAsync.mock.calls[0]![0].draft;
  expect(draft.kind).toBe('location');
  expect(draft.content.content[0].content[0].text).toBe('entryPromptlandscape');
  expect(draft.content.content).toHaveLength(6);
});
it('does not submit while navigation is blocked or a mutation is pending', async () => {
  await render(true);
  await submit();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  state.isPending = true;
  await render();
  await submit();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  expect(
    [...container.querySelectorAll('select')].every((select) => select.disabled)
  ).toBe(true);
});
it('retains input and selection when creation fails', async () => {
  state.mutateAsync.mockRejectedValueOnce(new Error('Conflict'));
  const onCreated = await render();
  await choose(container.querySelectorAll('select')[1]!, 'structured');
  await submit();
  expect(onCreated).not.toHaveBeenCalled();
  expect(container.querySelector('input')!.value).toBe('  Hero  ');
  expect(container.querySelectorAll('select')[1]!.value).toBe('structured');
});
