// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotebookImport } from './notebook-import';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  push: vi.fn(),
  invalidate: vi.fn(),
  assertActive: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  previewLettinNotebookImport: mocks.preview,
  applyLettinNotebookImport: mocks.apply,
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
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
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(async () => {
  mocks.assertActive.mockImplementation(() => {});
  mocks.preview.mockResolvedValue({
    id: 'preview',
    title: 'Copy',
    count: 1,
    entries: [{ title: 'Included entry', kind: 'page' }],
  });
  mocks.apply.mockResolvedValue({ id: 'new-notebook' });
  await act(async () => root.render(<NotebookImport wsId="destination" />));
});
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
});
function button(text: string) {
  return [...container.querySelectorAll('button')].find(
    (el) => el.textContent === text
  )!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function fill(text = '{"format":"lettin-notebook"}') {
  const title = container.querySelector('input:not([type])')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(title, 'Copy');
    title.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const file = container.querySelector('input[type=file]')!;
  Object.defineProperty(file, 'files', {
    configurable: true,
    value: [{ size: text.length, text: async () => text }],
  });
  await act(async () =>
    file.dispatchEvent(new Event('change', { bubbles: true }))
  );
}
async function consent() {
  await act(async () =>
    (
      container.querySelector('input[type=checkbox]') as HTMLInputElement
    ).click()
  );
}
async function review() {
  await fill();
  await consent();
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
}
it('requires explicit source permission before previewing', async () => {
  await fill();
  expect(button('reviewImport').disabled).toBe(true);
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(mocks.preview).not.toHaveBeenCalled();
  await consent();
  expect(button('reviewImport').disabled).toBe(false);
});
it('reviews the stored preview before an explicit private apply in the destination workspace', async () => {
  await review();
  expect(mocks.preview).toHaveBeenCalledWith('destination', {
    title: 'Copy',
    payload: { format: 'lettin-notebook' },
    consent: true,
    expectedActor: 'actor-a',
  });
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(container.textContent).toContain('notebookImportBoundary');
  await click('createImport');
  expect(mocks.apply).toHaveBeenCalledWith('destination', {
    previewId: 'preview',
    consent: true,
    expectedActor: 'actor-a',
  });
  expect(mocks.push).toHaveBeenCalledWith(
    '/destination/wiki/new-notebook/overview'
  );
});
it('rejects invalid JSON without submitting it', async () => {
  await fill('{');
  expect(container.querySelector('[role=alert]')!.textContent).toBe(
    'invalidImportFile'
  );
  expect(button('reviewImport').disabled).toBe(true);
  expect(mocks.preview).not.toHaveBeenCalled();
});
it('retains review for retry after apply failure', async () => {
  await review();
  mocks.apply.mockRejectedValueOnce(new Error('fixture'));
  await click('createImport');
  expect(container.querySelector('[role=alert]')!.textContent).toBe(
    'requestFailed'
  );
  expect(button('createImport')).toBeDefined();
  expect(mocks.push).not.toHaveBeenCalled();
  await click('createImport');
  expect(mocks.push).toHaveBeenCalledTimes(1);
});
it('suppresses preview completion after dialog closure', async () => {
  let finish!: (result: unknown) => void;
  mocks.preview.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await fill();
  await consent();
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  await click('close-export');
  await act(async () =>
    finish({ id: 'preview', title: 'Old', count: 0, entries: [] })
  );
  expect(container.textContent).not.toContain('Old');
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('fences rapid duplicate apply and stops navigation after actor revocation', async () => {
  await review();
  let finish!: (result: unknown) => void;
  mocks.apply.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => {
    button('createImport').click();
    button('createImport').click();
  });
  expect(mocks.apply).toHaveBeenCalledTimes(1);
  mocks.assertActive.mockImplementation(() => {
    throw new Error('Account changed');
  });
  await act(async () => finish({ id: 'new-notebook' }));
  expect(mocks.push).not.toHaveBeenCalled();
});
