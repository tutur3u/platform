// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotebookExport } from './notebook-export';

const mocks = vi.hoisted(() => ({ export: vi.fn(), assertActive: vi.fn() }));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  exportLettinNotebook: mocks.export,
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: { mutationFn: () => Promise<unknown> }) => ({
    mutateAsync: options.mutationFn,
    isPending: false,
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => ({
    actorId: 'actor-a',
    assertActive: mocks.assertActive,
  }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
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
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange: (value: boolean) => void;
    }) => (
      <div>
        <button type="button" onClick={() => onOpenChange(true)}>
          open-export
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          close-export
        </button>
        {children}
      </div>
    ),
    ...Object.fromEntries(
      [
        'DialogContent',
        'DialogDescription',
        'DialogHeader',
        'DialogTitle',
        'DialogTrigger',
      ].map((name) => [name, Container])
    ),
  };
});
const container = document.createElement('div'),
  root = createRoot(container);
const result = {
  format: 'lettin-notebook',
  version: 1,
  world: { id: 'world' },
  entries: [],
};
let create: ReturnType<typeof vi.fn>, revoke: ReturnType<typeof vi.fn>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  create = vi.fn(() => 'blob:fixture');
  revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  mocks.export.mockResolvedValue(result);
  mocks.assertActive.mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
async function render(
  props: Partial<ComponentProps<typeof NotebookExport>> = {}
) {
  await act(async () =>
    root.render(
      <NotebookExport
        wsId="workspace"
        worldId="world"
        worldRole="owner"
        published
        disabled={false}
        {...props}
      />
    )
  );
}
function button(text: string) {
  return [...container.querySelectorAll('button')].find(
    (el) => el.textContent === text
  )!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function scope(value: string) {
  await act(async () => {
    const select = container.querySelector('select')!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('defaults to published scope and downloads only after explicit action', async () => {
  await render();
  await click('open-export');
  expect(mocks.export).not.toHaveBeenCalled();
  await click('downloadNotebookJson');
  expect(mocks.export).toHaveBeenCalledWith('workspace', {
    worldId: 'world',
    scope: 'published',
    privateConsent: false,
    expectedActor: 'actor-a',
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('blob:fixture');
  expect(document.querySelector('a[download]')).toBeNull();
});
it('requires affirmative private consent and clears it when the dialog is reopened', async () => {
  await render({ published: false });
  await click('open-export');
  expect(button('downloadNotebookJson').disabled).toBe(true);
  await scope('draft');
  expect(button('downloadNotebookJson').disabled).toBe(true);
  await act(async () =>
    container
      .querySelector('input[type="checkbox"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  );
  await click('downloadNotebookJson');
  expect(mocks.export).toHaveBeenCalledWith(
    'workspace',
    expect.objectContaining({ scope: 'draft', privateConsent: true })
  );
  await click('close-export');
  await click('open-export');
  expect(container.querySelector('select')!.value).toBe('published');
  await scope('draft');
  expect(container.querySelector<HTMLInputElement>('input')!.checked).toBe(
    false
  );
});
it('blocks unsaved edits and keeps private mode unavailable to collaborators', async () => {
  await render({ disabled: true });
  expect(button('exportNotebook').disabled).toBe(true);
  await click('downloadNotebookJson');
  expect(mocks.export).not.toHaveBeenCalled();
  await render({ worldRole: 'editor' });
  expect(
    container.querySelector<HTMLOptionElement>('option[value="draft"]')!
      .disabled
  ).toBe(true);
});
it('suppresses deferred downloads after closing the dialog', async () => {
  let finish!: (value: unknown) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await click('downloadNotebookJson');
  await click('close-export');
  await act(async () => finish(result));
  expect(create).not.toHaveBeenCalled();
});
it('suppresses deferred downloads after unmount or actor lifetime expiration', async () => {
  let finish!: (value: unknown) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await click('downloadNotebookJson');
  mocks.assertActive.mockImplementation(() => {
    throw new Error('Account changed');
  });
  await act(async () => finish(result));
  expect(create).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')!.textContent).toBe(
    'requestFailed'
  );
  mocks.assertActive.mockImplementation(() => {});
  await click('downloadNotebookJson');
  await act(async () => root.render(null));
  await act(async () => finish(result));
  expect(create).not.toHaveBeenCalled();
});
it('fences repeated clicks while pending and exposes failure without an automatic retry', async () => {
  let fail!: (value: Error) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  await render();
  await act(async () => {
    button('downloadNotebookJson').click();
    button('downloadNotebookJson').click();
  });
  expect(mocks.export).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error('Denied')));
  expect(create).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')!.textContent).toBe(
    'requestFailed'
  );
});
