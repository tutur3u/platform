// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { QuickNote } from './quick-note';

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  errorMessage: null as string | null,
}));
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
      'DialogHeader',
      'DialogDescription',
      'DialogTitle',
      'DialogTrigger',
    ].map((name) => [name, Container])
  );
});
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
  state.isPending = false;
  state.errorMessage = null;
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
  await submit();
  expect(state.mutateAsync).toHaveBeenCalledTimes(1);
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
  await render(false, vi.fn(), 'other-notebook');
  expect(container.querySelector('input')!.value).toBe('');
  expect(container.querySelector('textarea')!.value).toBe('');
});
