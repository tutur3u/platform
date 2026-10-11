// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { TaskPlanComposer } from './task-plan-composer';

const { createTask, boards, projects, translation } = vi.hoisted(() => ({
  createTask: vi.fn(),
  boards: vi.fn(),
  projects: vi.fn(),
  translation: { locale: 'en' },
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceTask: createTask,
  listWorkspaceBoardsWithLists: boards,
  listWorkspaceTaskProjects: projects,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages = translation.locale === 'vi' ? vietnamese : en;
    return key
      .split('.')
      .reduce<unknown>(
        (value, part) => (value as Record<string, unknown>)[part],
        messages['task-plan']
      );
  },
}));
vi.mock('@/i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
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
let currentClient: QueryClient;
let dispose: () => void = () => {};
afterEach(() => {
  dispose();
  vi.resetAllMocks();
  translation.locale = 'en';
});
async function mount(source: string | undefined = sourceUrl) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['task-plan-boards', 'workspace'], data);
  boards.mockResolvedValue(data);
  projects.mockResolvedValue([
    { id: 'project-1', name: 'Creative series', status: 'active' },
  ]);
  currentClient = client;
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
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
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
  expect(projects).not.toHaveBeenCalled();
  expect(
    container.querySelector<HTMLInputElement>('input[name=projectAssociation]')
      ?.checked
  ).toBe(false);
  expect(
    container.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked
  ).toBe(false);
  expect(container.textContent).toContain(en['task-plan'].destinationConsent);
  expect(container.textContent).toContain(en['task-plan'].sourceConsent);
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
  expect(container.querySelector('[role=alert] p')?.textContent).toBe(
    en['task-plan'].createFailed
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

it.each(['critical', 'high', 'normal', 'low'])(
  'submits explicitly chosen %s priority without source sharing',
  async (priority) => {
    createTask.mockResolvedValue({ task: { id: 'created-task' } });
    const container = await mount();
    await fill(container);
    await change(container.querySelectorAll('select')[2]!, priority);
    await submit(container);
    expect(createTask).toHaveBeenCalledExactlyOnceWith('workspace', {
      name: 'Draw a character study',
      listId: 'list-1',
      priority,
    });
  }
);
it('omits priority after clearing an explicit choice', async () => {
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  const container = await mount();
  await fill(container);
  await change(container.querySelectorAll('select')[2]!, 'high');
  await change(container.querySelectorAll('select')[2]!, '');
  await submit(container);
  expect(createTask.mock.calls[0]?.[1]).not.toHaveProperty('priority');
});
it('preserves the chosen priority in the locked form after denied creation', async () => {
  createTask.mockRejectedValueOnce(new Error('Forbidden'));
  const container = await mount();
  await fill(container);
  await change(container.querySelectorAll('select')[2]!, 'low');
  await submit(container);
  expect(container.querySelectorAll('select')[2]?.value).toBe('low');
  expect(createTask).toHaveBeenCalledTimes(1);
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
  await submit(container);
  expect(createTask).toHaveBeenCalledTimes(1);
  expect(createTask.mock.calls[0]?.[1]).toEqual({
    name: 'Draw a character study',
    listId: 'list-1',
    priority: 'low',
  });
});

it.each([
  ['en', en],
  ['vi', vietnamese],
] as const)(
  'renders the real %s priority strings with no priority selected',
  async (locale, messages) => {
    translation.locale = locale;
    const container = await mount();
    const text = container.textContent;
    expect(text).toContain(messages['task-plan'].priority);
    expect(text).toContain(messages['task-plan'].priorityHint);
    expect(text).toContain(messages['task-plan'].priorityUnspecified);
    for (const label of Object.values(messages['task-plan'].priorityOptions))
      expect(text).toContain(label);
    expect(container.querySelectorAll('select')[2]?.value).toBe('');
  }
);

it.each([new TypeError('Failed to fetch'), new Error('Internal server error')])(
  'prevents another create after an unconfirmed response: %s',
  async (error) => {
    createTask.mockRejectedValue(error);
    const container = await mount();
    await fill(container);
    await submit(container);
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    expect(
      container.querySelector('[role=alert] a')?.getAttribute('href')
    ).toBe('/personal/boards/board-1');
    await submit(container);
    expect(createTask).toHaveBeenCalledTimes(1);
  }
);

async function toggleProject(container: HTMLElement) {
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[name=projectAssociation]')!
      .click()
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
it('loads workspace project choices only after opt-in and requires explicit selection', async () => {
  const container = await mount();
  await fill(container);
  await toggleProject(container);
  expect(projects).toHaveBeenCalledExactlyOnceWith('workspace');
  expect(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')?.value
  ).toBe('');
  expect(
    container.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled
  ).toBe(true);
  await submit(container);
  expect(createTask).not.toHaveBeenCalled();
});
it('associates only the chosen destination project without attaching source content', async () => {
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  const container = await mount();
  await fill(container);
  await toggleProject(container);
  await change(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')!,
    'project-1'
  );
  await submit(container);
  expect(createTask).toHaveBeenCalledExactlyOnceWith('workspace', {
    name: 'Draw a character study',
    listId: 'list-1',
    project_ids: ['project-1'],
  });
});
it('omits a previously selected project when association is unchecked', async () => {
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  const container = await mount();
  await fill(container);
  await toggleProject(container);
  await change(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')!,
    'project-1'
  );
  await toggleProject(container);
  await submit(container);
  expect(createTask.mock.calls[0]?.[1]).not.toHaveProperty('project_ids');
});
it('blocks project load failure without retrying automatically and allows explicit opt-out', async () => {
  const container = await mount();
  projects.mockRejectedValue(new Error('Forbidden'));
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  await fill(container);
  await toggleProject(container);
  expect(projects).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(en['task-plan'].projectsFailed);
  await submit(container);
  expect(createTask).not.toHaveBeenCalled();
  await toggleProject(container);
  await submit(container);
  expect(createTask.mock.calls[0]?.[1]).toEqual({
    name: 'Draw a character study',
    listId: 'list-1',
  });
});
it('blocks stale project selection after refreshed choices remove the project', async () => {
  const container = await mount();
  await fill(container);
  await toggleProject(container);
  await change(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')!,
    'project-1'
  );
  await act(async () =>
    currentClient.setQueryData(['task-plan-projects', 'workspace'], [])
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(container.textContent).toContain(en['task-plan'].noProjects);
  await submit(container);
  expect(createTask).not.toHaveBeenCalled();
});
it('preserves the selected project in the locked form after denied creation', async () => {
  createTask.mockRejectedValueOnce(new Error('Forbidden'));
  const container = await mount();
  await fill(container);
  await toggleProject(container);
  await change(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')!,
    'project-1'
  );
  await submit(container);
  expect(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')?.value
  ).toBe('project-1');
  expect(createTask).toHaveBeenCalledTimes(1);
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
  await submit(container);
  expect(createTask).toHaveBeenCalledTimes(1);
  expect(createTask.mock.calls[0]?.[1].project_ids).toEqual(['project-1']);
});
it.each([
  ['en', en],
  ['vi', vietnamese],
] as const)(
  'renders %s project consent and empty-choice recovery',
  async (locale, messages) => {
    translation.locale = locale;
    const container = await mount();
    projects.mockResolvedValue([]);
    expect(container.textContent).toContain(
      messages['task-plan'].attachProject
    );
    expect(container.textContent).toContain(
      messages['task-plan'].projectConsent
    );
    await toggleProject(container);
    expect(container.textContent).toContain(
      messages['task-plan'].chooseProject
    );
    expect(container.textContent).toContain(messages['task-plan'].noProjects);
  }
);

it('blocks association while the opted-in project read is pending', async () => {
  const container = await mount();
  let resolve!: (value: unknown) => void;
  projects.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await fill(container);
  await toggleProject(container);
  expect(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')
      ?.disabled
  ).toBe(true);
  await submit(container);
  expect(createTask).not.toHaveBeenCalled();
  await act(async () => resolve([]));
});
it('lets an explicit retry recover the project read without creating automatically', async () => {
  const container = await mount();
  projects
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce([
      { id: 'project-1', name: 'Creative series', status: 'active' },
    ]);
  await fill(container);
  await toggleProject(container);
  expect(projects).toHaveBeenCalledTimes(1);
  const retry = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === en['task-plan'].retry
  )!;
  await act(async () => retry.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(projects).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('Creative series');
  expect(createTask).not.toHaveBeenCalled();
});
it('rejects stale cached association after a background project read fails', async () => {
  const container = await mount();
  await fill(container);
  await toggleProject(container);
  await change(
    container.querySelector<HTMLSelectElement>('select[name=projectId]')!,
    'project-1'
  );
  projects.mockRejectedValueOnce(new Error('Forbidden'));
  await act(async () =>
    currentClient.invalidateQueries({
      queryKey: ['task-plan-projects', 'workspace'],
    })
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(container.textContent).toContain(en['task-plan'].projectsFailed);
  await submit(container);
  expect(createTask).not.toHaveBeenCalled();
});

it.each([
  ['en', en],
  ['vi', vietnamese],
] as const)(
  'starts %s planning notes empty with the explicit destination sharing hint',
  async (locale, messages) => {
    translation.locale = locale;
    const container = await mount();
    const notes = container.querySelector('textarea')!;
    expect(notes.value).toBe('');
    expect(notes.maxLength).toBe(2000);
    expect(container.textContent).toContain(messages['task-plan'].notes);
    expect(container.textContent).toContain(messages['task-plan'].notesHint);
    expect(createTask).not.toHaveBeenCalled();
  }
);
it('saves authored notes without selecting source sharing or a project', async () => {
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  const container = await mount();
  await fill(container);
  await change(container.querySelector('textarea')!, 'Plan the first scene');
  await submit(container);
  const payload = createTask.mock.calls[0]?.[1];
  expect(JSON.parse(payload.description)).toEqual({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Plan the first scene' }],
      },
    ],
  });
  expect(JSON.stringify(payload)).not.toContain(sourceUrl);
  expect(payload).not.toHaveProperty('project_ids');
  expect(projects).not.toHaveBeenCalled();
});
it('retains notes while removing a previously selected source reference', async () => {
  createTask.mockResolvedValue({ task: { id: 'created-task' } });
  const container = await mount();
  await fill(container);
  await change(container.querySelector('textarea')!, 'My planning notes');
  const sharing = container.querySelector<HTMLInputElement>(
    'input[type=checkbox]'
  )!;
  await act(async () => sharing.click());
  await act(async () => sharing.click());
  await submit(container);
  expect(createTask.mock.calls[0]?.[1].description).toContain(
    'My planning notes'
  );
  expect(createTask.mock.calls[0]?.[1].description).not.toContain(sourceUrl);
});
it('preserves authored notes after an unconfirmed create and fences repeated submissions', async () => {
  createTask.mockRejectedValue(new TypeError('Failed to fetch'));
  const container = await mount();
  await fill(container);
  await change(container.querySelector('textarea')!, 'Keep this plan');
  await submit(container);
  expect(container.querySelector('textarea')?.value).toBe('Keep this plan');
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
  await submit(container);
  expect(createTask).toHaveBeenCalledTimes(1);
});
it('rejects an oversized programmatic note before sending a task command', async () => {
  const container = await mount();
  await fill(container);
  await change(container.querySelector('textarea')!, 'x'.repeat(2001));
  await submit(container);
  expect(createTask).not.toHaveBeenCalled();
  expect(
    container.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled
  ).toBe(true);
});
