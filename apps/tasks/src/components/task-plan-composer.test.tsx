// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskPlanComposer } from './task-plan-composer';

const { createTask, boards } = vi.hoisted(() => ({
  createTask: vi.fn(),
  boards: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceTask: createTask,
  listWorkspaceBoardsWithLists: boards,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: (props: ComponentProps<'button'>) => <button {...props} />,
}));

const data = {
  boards: [
    {
      id: 'board-1',
      name: 'First board',
      task_lists: [
        { id: 'list-1', name: 'First list', deleted: false },
        { id: 'archived', name: 'Archived list', deleted: true },
      ],
    },
    {
      id: 'board-2',
      name: 'Second board',
      task_lists: [{ id: 'list-2', name: 'Second list', deleted: false }],
    },
  ],
};
const sourceUrl =
  'https://lettin.tuturuuu.com/en/workspace/wiki/world/overview?entry=entry';
let dispose: () => void = () => {};
afterEach(() => {
  dispose();
  vi.resetAllMocks();
});
async function mount(source: string | undefined = sourceUrl) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['task-plan-boards', 'workspace'], data);
  boards.mockResolvedValue(data);
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <TaskPlanComposer
          wsId="workspace"
          routeWsId="personal"
          sourceUrl={source}
        />
      </QueryClientProvider>
    )
  );
  dispose = () => {
    act(() => root.unmount());
    client.clear();
  };
  return container;
}
async function change(
  input: HTMLInputElement | HTMLSelectElement,
  value: string
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set?.call(input, value);
    input.dispatchEvent(
      new Event(input instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      })
    );
  });
}
async function fill(container: HTMLElement) {
  await change(
    container.querySelector('input:not([type=checkbox])')!,
    'Draw a character study'
  );
  const selects = container.querySelectorAll('select');
  await change(selects[0]!, 'board-1');
  await change(selects[1]!, 'list-1');
}
async function submit(container: HTMLElement) {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
it('does not create on opening and defaults source sharing off', async () => {
  const container = await mount();
  expect(createTask).not.toHaveBeenCalled();
  expect(
    container.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked
  ).toBe(false);
  expect(container.textContent).toContain('destinationConsent');
  expect(container.textContent).toContain('sourceConsent');
  expect(container.querySelector('select')?.value).toBe('');
  expect(container.textContent).not.toContain('Archived list');
});
it('creates only the typed name in the explicitly chosen list without a source link', async () => {
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  const container = await mount();
  await fill(container);
  await submit(container);
  expect(createTask).toHaveBeenCalledExactlyOnceWith('workspace', {
    name: 'Draw a character study',
    listId: 'list-1',
  });
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    '/personal/boards/board-1?task=created-task'
  );
});
it('attaches only the reviewed private link after explicit opt-in', async () => {
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  const container = await mount();
  await fill(container);
  await act(async () =>
    container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()
  );
  await submit(container);
  const payload = createTask.mock.calls[0]?.[1];
  expect(JSON.parse(payload.description).content[0].content[0]).toMatchObject({
    text: sourceUrl,
    marks: [{ type: 'link', attrs: { href: sourceUrl } }],
  });
  expect(Object.keys(payload).sort()).toEqual([
    'description',
    'listId',
    'name',
  ]);
});
it('clears a stale list selection when the destination board changes', async () => {
  const container = await mount();
  await fill(container);
  await change(container.querySelectorAll('select')[0]!, 'board-2');
  expect(container.querySelectorAll('select')[1]?.value).toBe('');
  expect(
    container.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled
  ).toBe(true);
});
it('preserves form and source consent after denied creation without automatic retries', async () => {
  createTask.mockRejectedValue(new Error('Forbidden'));
  const container = await mount();
  await fill(container);
  await act(async () =>
    container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()
  );
  await submit(container);
  expect(createTask).toHaveBeenCalledTimes(1);
  expect(
    container.querySelector<HTMLInputElement>('input:not([type=checkbox])')
      ?.value
  ).toBe('Draw a character study');
  expect(
    container.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked
  ).toBe(true);
  expect(container.querySelector('[role=alert]')?.textContent).toBe(
    'createFailed'
  );
});
it('locks the form while a create is pending', async () => {
  let resolve!: (value: unknown) => void;
  createTask.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const container = await mount();
  await fill(container);
  await act(async () => {
    const form = container.querySelector('form')!;
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 5));
  });
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
  expect(createTask).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ task: { id: 'created-task' } }));
});
