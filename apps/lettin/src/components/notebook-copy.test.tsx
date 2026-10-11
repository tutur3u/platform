// @vitest-environment jsdom
import { InternalApiError } from '@tuturuuu/internal-api';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { NotebookCopy } from './notebook-copy';

const mocks = vi.hoisted(() => ({
  export: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  invalidate: vi.fn(),
  assertActive: vi.fn(),
  actorId: 'actor-a' as string | null,
  locale: 'en',
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  exportLettinNotebook: mocks.export,
  previewLettinNotebookImport: mocks.preview,
  applyLettinNotebookImport: mocks.apply,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () =>
    mocks.actorId
      ? { actorId: mocks.actorId, assertActive: mocks.assertActive }
      : null,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { title?: string }) => {
    const messages = mocks.locale === 'vi' ? viMessages.lettin : en.lettin;
    return (
      messages[key as keyof typeof messages]?.replace(
        '{title}',
        values?.title ?? ''
      ) ?? key
    );
  },
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
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
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange: (value: boolean) => void;
    }) => (
      <div>
        <button type="button" onClick={() => onOpenChange(true)}>
          open-copy
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          close-copy
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
const props = {
  wsId: 'workspace',
  worldId: 'source',
  worldRole: 'owner' as const,
  sourceVersion: 1,
  sourceTitle: 'Saved notebook',
  disabled: false,
};
const preview = {
  id: 'preview',
  title: 'Reviewed copy',
  count: 1,
  entries: [{ title: 'Included entry', kind: 'page' }],
};
const payload = { format: 'lettin-notebook', scope: 'draft', entries: [] };
function text(key: keyof typeof en.lettin) {
  return (mocks.locale === 'vi' ? viMessages : en).lettin[key];
}
function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (el) => el.textContent === label
  )!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function render(
  overrides: Partial<ComponentProps<typeof NotebookCopy>> = {}
) {
  await act(async () =>
    root.render(<NotebookCopy {...props} {...overrides} />)
  );
}
async function consent() {
  await act(async () =>
    (
      container.querySelector('input[type=checkbox]') as HTMLInputElement
    ).click()
  );
}
async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
}
async function review() {
  await consent();
  await submit();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  sessionStorage.clear();
  vi.resetAllMocks();
  mocks.actorId = 'actor-a';
  mocks.locale = 'en';
  mocks.export.mockResolvedValue(payload);
  mocks.preview.mockResolvedValue(preview);
  mocks.apply.mockResolvedValue({ id: 'created' });
  mocks.invalidate.mockResolvedValue(undefined);
  await render();
});
afterEach(async () => {
  await act(async () => root.render(null));
  vi.restoreAllMocks();
});
it.each(['editor', 'publisher'] as const)(
  'omits notebook copies for %s roles',
  async (worldRole) => {
    await render({ worldRole });
    expect(container.textContent).toBe('');
    expect(mocks.export).not.toHaveBeenCalled();
  }
);
it('disables copies without an active actor or with unsaved edits', async () => {
  mocks.actorId = null;
  await render();
  expect(button(text('copyNotebook')).disabled).toBe(true);
  mocks.actorId = 'actor-a';
  await render({ disabled: true });
  expect(button(text('copyNotebook')).disabled).toBe(true);
  await consent();
  await submit();
  expect(mocks.export).not.toHaveBeenCalled();
});
it.each(['en', 'vi'])(
  'requires affirmative consent and reviews the server snapshot in %s',
  async (locale) => {
    mocks.locale = locale;
    await render();
    await click('open-copy');
    expect(
      (container.querySelector('input[type=checkbox]') as HTMLInputElement)
        .checked
    ).toBe(false);
    expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
    expect(container.textContent).toContain(text('notebookCopyConsent'));
    await submit();
    expect(mocks.export).not.toHaveBeenCalled();
    await review();
    expect(mocks.export).toHaveBeenCalledWith('workspace', {
      worldId: 'source',
      scope: 'draft',
      privateConsent: true,
      expectedActor: 'actor-a',
    });
    expect(mocks.preview).toHaveBeenCalledWith('workspace', {
      title: text('notebookCopyDefaultTitle').replace(
        '{title}',
        'Saved notebook'
      ),
      payload,
      consent: true,
      expectedActor: 'actor-a',
    });
    expect(container.textContent).toContain('Reviewed copy');
    expect(container.textContent).toContain('Included entry');
    expect(mocks.apply).not.toHaveBeenCalled();
    await click(text('createImport'));
    expect(mocks.apply).toHaveBeenCalledWith('workspace', {
      previewId: 'preview',
      consent: true,
      expectedActor: 'actor-a',
    });
    expect(mocks.invalidate).toHaveBeenCalledWith({
      queryKey: ['lettin', 'workspace'],
    });
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/workspace/wiki/created/overview'
    );
    expect(container.textContent).toContain(text('notebookCopyCreated'));
  }
);
it('bounds the initial title and refuses a whitespace-only title', async () => {
  await render({ sourceTitle: 'x'.repeat(200), sourceVersion: 2 });
  expect(
    (container.querySelector('input:not([type])') as HTMLInputElement).value
      .length
  ).toBe(160);
  await act(async () => {
    const input = container.querySelector('input:not([type])')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, '   ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await consent();
  await submit();
  expect(mocks.export).not.toHaveBeenCalled();
});
it('requires fresh consent and a fresh export after returning from review', async () => {
  await review();
  await click(text('back'));
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  await review();
  expect(mocks.export).toHaveBeenCalledTimes(2);
  expect(mocks.apply).not.toHaveBeenCalled();
});
it.each(['export', 'preview'] as const)(
  'does not create a notebook after %s fails',
  async (phase) => {
    mocks[phase].mockRejectedValueOnce(new Error('Fixture denied'));
    await review();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]')?.textContent).toBe(
      text('requestFailed')
    );
    if (phase === 'export') expect(mocks.preview).not.toHaveBeenCalled();
  }
);
it('checks actor authority before exporting', async () => {
  mocks.assertActive.mockImplementation(() => {
    throw new Error('Actor revoked');
  });
  await review();
  expect(mocks.export).not.toHaveBeenCalled();
  expect(mocks.preview).not.toHaveBeenCalled();
});
it('suppresses a stale export after closing and permits a fresh attempt on reopening', async () => {
  const flight = deferred<unknown>();
  mocks.export.mockReturnValueOnce(flight.promise);
  await review();
  await click('close-copy');
  await click('open-copy');
  await act(async () => flight.resolve(payload));
  expect(mocks.preview).not.toHaveBeenCalled();
  await review();
  expect(mocks.export).toHaveBeenCalledTimes(2);
  expect(mocks.preview).toHaveBeenCalledTimes(1);
});
it('suppresses an old actor export after the actor changes', async () => {
  const flight = deferred<unknown>();
  mocks.export.mockReturnValueOnce(flight.promise);
  await review();
  mocks.actorId = 'actor-b';
  await render();
  await act(async () => flight.resolve(payload));
  expect(mocks.preview).not.toHaveBeenCalled();
  await review();
  expect(mocks.preview).toHaveBeenCalledWith(
    'workspace',
    expect.objectContaining({ expectedActor: 'actor-b' })
  );
});
it.each([
  { sourceVersion: 2 },
  { wsId: 'other' },
  { worldId: 'other' },
  { disabled: true },
  { worldRole: 'editor' as const },
])('discards prepared review when context changes: %j', async (overrides) => {
  await review();
  await render(overrides);
  expect(container.textContent).not.toContain('Reviewed copy');
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('fences rapid review and creation submissions', async () => {
  const exporting = deferred<unknown>();
  mocks.export.mockReturnValueOnce(exporting.promise);
  await consent();
  await act(async () => {
    const form = container.querySelector('form')!;
    for (let i = 0; i < 2; i++)
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
  });
  expect(mocks.export).toHaveBeenCalledTimes(1);
  await act(async () => exporting.resolve(payload));
  const applying = deferred<{ id: string }>();
  mocks.apply.mockReturnValueOnce(applying.promise);
  await act(async () => {
    button(text('createImport')).click();
    button(text('createImport')).click();
  });
  expect(mocks.apply).toHaveBeenCalledTimes(1);
  await act(async () => applying.resolve({ id: 'created' }));
});
it('discards preview completion after closing', async () => {
  const flight = deferred<typeof preview>();
  mocks.preview.mockReturnValueOnce(flight.promise);
  await review();
  await click('close-copy');
  await act(async () => flight.resolve(preview));
  expect(container.textContent).not.toContain('Reviewed copy');
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('does not present or refresh an already submitted creation after closure', async () => {
  await review();
  const flight = deferred<{ id: string }>();
  mocks.apply.mockReturnValueOnce(flight.promise);
  await click(text('createImport'));
  await click('close-copy');
  await act(async () => flight.resolve({ id: 'created' }));
  expect(mocks.apply).toHaveBeenCalledTimes(1);
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(container.querySelector('a')).toBeNull();
});
it('retains confirmed creation when the Studio refresh fails', async () => {
  mocks.invalidate.mockRejectedValueOnce(new Error('Refresh failed'));
  await review();
  await click(text('createImport'));
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    '/workspace/wiki/created/overview'
  );
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('notebookCopyRefreshFailed')
  );
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('blocks retries of uncertain creation outcomes', async () => {
  mocks.apply.mockRejectedValueOnce(new Error('Connection lost'));
  await review();
  await click(text('createImport'));
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('notebookCopyUncertain')
  );
  expect(button(text('createImport')).disabled).toBe(true);
  await click(text('createImport'));
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});

it('requires a new preview after the server expires the reviewed import', async () => {
  mocks.apply.mockRejectedValueOnce(
    new InternalApiError('Expired fixture', 410)
  );
  await review();
  await click(text('createImport'));
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('importExpired')
  );
  await click(text('back'));
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  await review();
  expect(mocks.export).toHaveBeenCalledTimes(2);
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});

it('retains an unknown submitted copy across close, reopen and transient context remounts', async () => {
  mocks.apply.mockRejectedValueOnce(new Error('Response lost'));
  await review();
  await click(text('createImport'));
  await click('close-copy');
  await click('open-copy');
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('notebookCopyUncertain')
  );
  await render({ sourceVersion: 2, disabled: true });
  await render({ sourceVersion: 2 });
  await click('open-copy');
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('records an accepted copy after closure and restores its link on reopen', async () => {
  await review();
  const flight = deferred<{ id: string }>();
  mocks.apply.mockReturnValueOnce(flight.promise);
  await click(text('createImport'));
  await click('close-copy');
  await act(async () => flight.resolve({ id: 'accepted-after-close' }));
  expect(mocks.invalidate).not.toHaveBeenCalled();
  await click('open-copy');
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    '/workspace/wiki/accepted-after-close/overview'
  );
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('keeps a rejected response after closure blocked when the same scope is reopened', async () => {
  await review();
  let reject!: (reason: Error) => void;
  mocks.apply.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    })
  );
  await click(text('createImport'));
  await click('close-copy');
  await act(async () => reject(new Error('Unconfirmed response')));
  await click('open-copy');
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('notebookCopyUncertain')
  );
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('does not leak a scoped unknown receipt into another actor or workspace and restores it on return', async () => {
  mocks.apply.mockRejectedValueOnce(new Error('Unknown'));
  await review();
  await click(text('createImport'));
  mocks.actorId = 'actor-b';
  await render();
  await consent();
  expect(button(text('reviewNotebookCopy')).disabled).toBe(false);
  await render({ wsId: 'other-workspace' });
  await consent();
  expect(button(text('reviewNotebookCopy')).disabled).toBe(false);
  mocks.actorId = 'actor-a';
  await render();
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('blocks apply before transport when its receipt cannot be retained', async () => {
  await review();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Quota');
  });
  await click(text('createImport'));
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('retains a scoped unknown receipt through a full control unmount', async () => {
  mocks.apply.mockRejectedValueOnce(new Error('Unknown'));
  await review();
  await click(text('createImport'));
  await act(async () => root.render(null));
  await render();
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('notebookCopyUncertain')
  );
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});

it('retains truthful uncertainty when an expired receipt cannot be removed', async () => {
  mocks.apply.mockRejectedValueOnce(new InternalApiError('Expired', 410));
  await review();
  const remove = vi
    .spyOn(Storage.prototype, 'removeItem')
    .mockImplementation(() => {
      throw new Error('Storage removal denied');
    });
  await click(text('createImport'));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('notebookCopyUncertain')
  );
  expect(button(text('createImport')).disabled).toBe(true);
  await click(text('createImport'));
  await click('close-copy');
  await click('open-copy');
  expect(button(text('reviewNotebookCopy')).disabled).toBe(true);
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    text('notebookCopyUncertain')
  );
  expect(mocks.apply).toHaveBeenCalledTimes(1);
  expect(mocks.preview).toHaveBeenCalledTimes(1);
});
