// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotebookExport } from './notebook-export';

const mocks = vi.hoisted(() => ({
  export: vi.fn(),
  copy: vi.fn(),
  actorId: 'actor-a',
  assertActive: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  exportLettinNotebook: mocks.export,
}));
vi.mock('./notebook-drive-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notebook-drive-copy')>()),
  copyNotebookToDrive: mocks.copy,
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: { mutationFn: () => Promise<unknown> }) => ({
    mutateAsync: options.mutationFn,
    isPending: false,
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => ({
    actorId: mocks.actorId,
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
  mocks.actorId = 'actor-a';
  mocks.copy.mockResolvedValue({
    path: 'Lettin/fixture.json',
    finalize: { success: true },
  });
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
async function destination(value: string) {
  await act(async () => {
    const select = container.querySelectorAll('select')[1]!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function consent(index = 0) {
  await act(async () =>
    container
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      [index]!.click()
  );
}
async function ready() {
  await render();
  await click('open-export');
  await destination('drive');
}
it('requires separate destination sharing consent before published source export or Drive upload', async () => {
  await ready();
  await click('copyNotebookToDrive');
  expect(mocks.export).not.toHaveBeenCalled();
  expect(mocks.copy).not.toHaveBeenCalled();
  await consent();
  await click('copyNotebookToDrive');
  expect(mocks.export).toHaveBeenCalledWith('workspace', {
    worldId: 'world',
    scope: 'published',
    privateConsent: false,
    expectedActor: 'actor-a',
  });
  expect(mocks.copy).toHaveBeenCalledWith(
    'workspace',
    expect.any(Blob),
    expect.any(Function)
  );
  expect(create).not.toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'exportDrive_saved'
  );
  expect(container.querySelector<HTMLInputElement>('input')!.checked).toBe(
    false
  );
});
it('requires both independent consents for owner-only saved drafts', async () => {
  await ready();
  await scope('draft');
  await consent(0);
  expect(button('copyNotebookToDrive').disabled).toBe(true);
  await consent(1);
  await click('copyNotebookToDrive');
  expect(mocks.export).toHaveBeenCalledWith(
    'workspace',
    expect.objectContaining({ scope: 'draft', privateConsent: true })
  );
  await render({ worldRole: 'editor' });
  expect(button('copyNotebookToDrive').disabled).toBe(true);
});
it.each([
  ['partial', { finalize: { success: false } }],
  ['partial', {}],
])(
  'reports %s instead of success when finalization is incomplete',
  async (_, value) => {
    mocks.copy.mockResolvedValue(value);
    await ready();
    await consent();
    await click('copyNotebookToDrive');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'exportDrive_partial'
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(button('copyNotebookToDrive').disabled).toBe(true);
  }
);
it('reports uncertainty after an upload error and requires fresh consent for explicit retry', async () => {
  mocks.copy.mockRejectedValue(new Error('Unconfirmed'));
  await ready();
  await consent();
  await click('copyNotebookToDrive');
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'exportDrive_uncertain'
  );
  await click('copyNotebookToDrive');
  expect(mocks.copy).toHaveBeenCalledTimes(1);
  await consent();
  await click('copyNotebookToDrive');
  expect(mocks.copy).toHaveBeenCalledTimes(2);
});
it('does not claim an uncertain upload when source export itself was denied', async () => {
  mocks.export.mockRejectedValue(new Error('Source denied'));
  await ready();
  await consent();
  await click('copyNotebookToDrive');
  expect(mocks.copy).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'requestFailed'
  );
});
it('disables all copy controls and fences synchronous duplicate clicks throughout upload', async () => {
  let finish!: (value: unknown) => void;
  mocks.copy.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await ready();
  await consent();
  await act(async () => {
    button('copyNotebookToDrive').click();
    button('copyNotebookToDrive').click();
  });
  expect(mocks.export).toHaveBeenCalledTimes(1);
  expect(mocks.copy).toHaveBeenCalledTimes(1);
  expect(
    [
      ...container.querySelectorAll<HTMLSelectElement | HTMLInputElement>(
        'select,input'
      ),
    ].every((el) => el.disabled)
  ).toBe(true);
  await act(async () => finish({ finalize: { success: true } }));
});
it.each([
  'close',
  'world',
  'workspace',
  'actor',
  'dirty',
  'published',
  'owner',
])('suppresses deferred copying after %s changes', async (change) => {
  let finish!: (value: unknown) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await ready();
  if (change === 'owner') {
    await scope('draft');
    await consent(0);
    await consent(1);
  } else await consent();
  await click('copyNotebookToDrive');
  if (change === 'close') await click('close-export');
  if (change === 'world') await render({ worldId: 'other' });
  if (change === 'workspace') await render({ wsId: 'other' });
  if (change === 'actor') {
    mocks.actorId = 'actor-b';
    await render();
  }
  if (change === 'dirty') await render({ disabled: true });
  if (change === 'published') await render({ published: false });
  if (change === 'owner') await render({ worldRole: 'editor' });
  await act(async () => finish(result));
  expect(mocks.copy).not.toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')).toBeNull();
});
it('clears destination consent after scope, destination, and dialog changes', async () => {
  await ready();
  await consent();
  await scope('draft');
  expect(
    container.querySelectorAll<HTMLInputElement>('input')[1]!.checked
  ).toBe(false);
  await scope('published');
  await consent();
  await destination('download');
  await destination('drive');
  expect(container.querySelector<HTMLInputElement>('input')!.checked).toBe(
    false
  );
  await consent();
  await click('close-export');
  await click('open-export');
  expect(container.querySelectorAll('select')[1]!.value).toBe('download');
});
it('passes a live lifetime guard into every upload stage', async () => {
  await ready();
  await consent();
  await click('copyNotebookToDrive');
  const guard = mocks.copy.mock.calls[0]![2] as () => void;
  mocks.assertActive.mockImplementation(() => {
    throw new Error('Account changed');
  });
  expect(guard).toThrow('Account changed');
});

it('suppresses stale completion after an admitted upload is closed without deleting or repeating the copy', async () => {
  let finish!: (value: unknown) => void;
  mocks.copy.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await ready();
  await consent();
  await click('copyNotebookToDrive');
  await click('close-export');
  await act(async () => finish({ finalize: { success: true } }));
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(mocks.copy).toHaveBeenCalledTimes(1);
});
