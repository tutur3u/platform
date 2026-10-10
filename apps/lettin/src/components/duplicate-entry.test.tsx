// @vitest-environment jsdom
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DuplicateEntry } from './duplicate-entry';

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
  state.isPending = false;
  state.errorMessage = null;
});
async function render(disabled = false, onCreated = vi.fn()) {
  await act(async () =>
    root.render(
      <DuplicateEntry
        wsId="workspace"
        worldId="notebook"
        record={record}
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
