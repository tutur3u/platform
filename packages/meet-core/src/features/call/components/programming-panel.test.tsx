// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import {
  type meetingProgrammingApi,
  ProgrammingPanel,
} from './programming-panel';

const workbench = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function Workbench(props: Record<string, unknown>) {
      workbench.calls.push(props);
      return <div data-testid="workbench" />;
    },
}));
vi.mock('./programming-resource-picker', () => ({
  ProgrammingResourcePicker: () => <div data-testid="picker" />,
}));
afterEach(() => {
  cleanup();
  workbench.calls.length = 0;
  window.sessionStorage.clear();
});
const t = messages.programmingPlayground;
const selection = {
  kind: 'playground',
  id: 'project',
  language: 'python',
} as const;
function api(
  active: boolean,
  current: {
    kind: 'playground' | 'problem';
    id: string;
    language: string;
  } = selection
): typeof meetingProgrammingApi {
  const read = vi.fn(async () =>
    active
      ? {
          selection: current,
          project: { id: current.id, name: 'Demo', language: current.language },
          endpoint: 'wss://realtime.example.invalid',
          token: 'synthetic',
          role: 'owner',
          actorId: 'host',
        }
      : { selection: null }
  );
  return {
    read: read as never,
    select: vi.fn(async () => ({ ok: true })) as never,
    create: vi.fn(async () => ({ id: 'created' })) as never,
    run: vi.fn() as never,
    readRun: vi.fn() as never,
    test: vi.fn() as never,
    readTest: vi.fn() as never,
    checkpoint: vi.fn() as never,
  };
}
function mount(props: {
  canManage: boolean;
  active: boolean;
  client?: typeof meetingProgrammingApi;
  current?: { kind: 'playground' | 'problem'; id: string; language: string };
}) {
  const current = props.current ?? selection;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <ProgrammingPanel
          meetingId="meeting"
          wsId="ws"
          accountId="host"
          canManage={props.canManage}
          selection={props.active ? (current as typeof selection) : null}
          api={props.client ?? api(props.active, current)}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('opens the Co-Programming dialog for hosts before a resource opens', async () => {
  mount({ canManage: true, active: false });
  const dialog = await screen.findByRole('dialog', { name: t.openTitle });
  expect(dialog).toBeTruthy();
  expect(
    screen.getByRole('radio', { name: new RegExp(t.playgroundChoice) })
  ).toBeTruthy();
  expect(
    screen.getByRole('radio', { name: new RegExp(t.problem) })
  ).toBeTruthy();
  expect(screen.getByRole('combobox', { name: t.language })).toBeTruthy();
  expect(screen.getByText(t.playgroundHelp)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.open })).toBeTruthy();
  expect(screen.getByRole('button', { name: t.cancel })).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.close })).toBeNull();
  expect(screen.queryByTestId('workbench')).toBeNull();
});

it('creates a new playground from the template when Open has no saved project', async () => {
  const client = api(false);
  mount({ canManage: true, active: false, client });
  const open = await screen.findByRole('button', { name: t.open });
  act(() => open.click());
  await waitFor(() =>
    expect(client.create).toHaveBeenCalledWith('meeting', {
      name: 'Python playground',
      empty: false,
      language: 'python',
    })
  );
  await waitFor(() =>
    expect(client.select).toHaveBeenCalledWith('meeting', {
      kind: 'playground',
      id: 'created',
      language: 'python',
    })
  );
});

it('tells participants to wait for the host instead of showing controls', async () => {
  mount({ canManage: false, active: false });
  expect((await screen.findByText(t.chooseResource)).getAttribute('role')).toBe(
    'status'
  );
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('keeps the dialog closed once a resource is open and moves host actions into the workbench menu', async () => {
  mount({ canManage: true, active: true });
  await screen.findByTestId('workbench');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  await waitFor(() => expect(workbench.calls.length).toBeGreaterThan(0));
  const props = workbench.calls.at(-1)!;
  expect(props.projectId).toBe('project');
  expect(props.roomKey).toBe('meeting:meeting:project:python');
  const actions = props.actions as {
    id: string;
    label: string;
    destructive?: boolean;
  }[];
  expect(actions.map((action) => [action.id, action.label])).toEqual([
    ['change-resource', t.changeResource],
    ['close-room', t.close],
  ]);
  expect(actions[1]?.destructive).toBe(true);
});

it('gives participants no host actions and no language switch', async () => {
  mount({ canManage: false, active: true });
  await screen.findByTestId('workbench');
  await waitFor(() => expect(workbench.calls.length).toBeGreaterThan(0));
  expect(workbench.calls.at(-1)!.actions).toEqual([]);
  expect(
    (workbench.calls.at(-1)!.meeting as { onRuntime?: unknown }).onRuntime
  ).toBeUndefined();
});

it('switches a playground language by opening a new templated playground', async () => {
  const client = api(true);
  mount({ canManage: true, active: true, client });
  await waitFor(() => expect(workbench.calls.length).toBeGreaterThan(0));
  const meeting = workbench.calls.at(-1)!.meeting as {
    onRuntime: (language: string) => void;
  };
  act(() => meeting.onRuntime('typescript'));
  await waitFor(() =>
    expect(client.create).toHaveBeenCalledWith('meeting', {
      name: 'TypeScript playground',
      empty: false,
      language: 'typescript',
    })
  );
  expect(client.select).toHaveBeenCalledWith('meeting', {
    kind: 'playground',
    id: 'created',
    language: 'typescript',
  });
});

it('reopens the playground this room already used for a language', async () => {
  window.sessionStorage.setItem(
    'meet.programming.playgrounds:meeting',
    JSON.stringify({ typescript: 'earlier' })
  );
  const client = api(true);
  mount({ canManage: true, active: true, client });
  await waitFor(() => expect(workbench.calls.length).toBeGreaterThan(0));
  const meeting = workbench.calls.at(-1)!.meeting as {
    onRuntime: (language: string) => void;
  };
  act(() => meeting.onRuntime('typescript'));
  await waitFor(() =>
    expect(client.select).toHaveBeenCalledWith('meeting', {
      kind: 'playground',
      id: 'earlier',
      language: 'typescript',
    })
  );
  expect(client.create).not.toHaveBeenCalled();
  expect(
    JSON.parse(
      window.sessionStorage.getItem('meet.programming.playgrounds:meeting')!
    )
  ).toEqual({ typescript: 'earlier', python: 'project' });
});

it('switches a problem language in place without creating a playground', async () => {
  const problem = {
    kind: 'problem',
    id: 'problem',
    language: 'python',
  } as const;
  const client = api(true, problem);
  mount({ canManage: true, active: true, client, current: problem });
  await waitFor(() => expect(workbench.calls.length).toBeGreaterThan(0));
  const meeting = workbench.calls.at(-1)!.meeting as {
    onRuntime: (language: string) => void;
  };
  act(() => meeting.onRuntime('javascript'));
  await waitFor(() =>
    expect(client.select).toHaveBeenCalledWith('meeting', {
      ...problem,
      language: 'javascript',
    })
  );
  expect(client.create).not.toHaveBeenCalled();
});

it('wires matching room presence and host actions to the workbench', async () => {
  const client = {
    ...api(true),
    readMira: vi.fn().mockResolvedValue({
      selection,
      voiceDraft: null,
      miraPresence: {
        active: true,
        source: 'live',
        filePath: 'solution.py',
        updatedAt: 1,
      },
    }),
    changeMira: vi.fn().mockResolvedValue({ ok: true }),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ProgrammingPanel
          meetingId="meeting"
          canManage
          selection={selection}
          api={client}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  await waitFor(() => {
    expect(workbench.calls.at(-1)?.meeting).toMatchObject({
      mira: { manage: true, presence: { filePath: 'solution.py' } },
    });
  });
  const action = { action: 'resolve', id: 'fixture', decision: 'dismissed' };
  const meeting = workbench.calls.at(-1)!.meeting as {
    mira: { onAction: (data: unknown) => void };
  };
  meeting.mira.onAction(action);
  await waitFor(() =>
    expect(client.changeMira).toHaveBeenCalledWith('meeting', selection, action)
  );
});

it('keeps a refused runner disabled for the call across workbench remounts', async () => {
  let current: { kind: 'playground'; id: string; language: string } = {
    ...selection,
  };
  const client = api(true);
  const read = client.read as unknown as ReturnType<typeof vi.fn>;
  const room = await read('meeting');
  read.mockImplementation(async () => ({
    ...room,
    selection: current,
    project: { ...room.project, id: current.id, language: current.language },
  }));
  mount({ canManage: true, active: true, client });
  await waitFor(() => expect(workbench.calls.length).toBeGreaterThan(0));
  const meeting = () =>
    workbench.calls.at(-1)!.meeting as {
      runnerUnavailable: boolean;
      onRunnerUnavailable: (value: boolean) => void;
      onRuntime: (language: string) => void;
    };
  const firstRoom = workbench.calls.at(-1)!.roomKey;
  expect(meeting().runnerUnavailable).toBe(false);
  act(() => meeting().onRunnerUnavailable(true));
  await waitFor(() => expect(meeting().runnerUnavailable).toBe(true));
  // The switch opens another playground, so the workbench remounts under a new key.
  current = { kind: 'playground', id: 'created', language: 'typescript' };
  act(() => meeting().onRuntime('typescript'));
  await waitFor(() =>
    expect(workbench.calls.at(-1)!.roomKey).toBe(
      'meeting:meeting:created:typescript'
    )
  );
  expect(firstRoom).toBe('meeting:meeting:project:python');
  expect(meeting().runnerUnavailable).toBe(true);
});
