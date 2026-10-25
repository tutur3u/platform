// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
});
const t = messages.programmingPlayground;
const selection = {
  kind: 'playground',
  id: 'project',
  language: 'python',
} as const;
function api(active: boolean): typeof meetingProgrammingApi {
  const read = vi.fn(async () =>
    active
      ? {
          selection,
          project: { id: 'project', name: 'Demo', language: 'python' },
          endpoint: 'wss://realtime.example.invalid',
          token: 'synthetic',
          role: 'owner',
          actorId: 'host',
        }
      : { selection: null }
  );
  return {
    read: read as never,
    select: vi.fn() as never,
    create: vi.fn() as never,
    run: vi.fn() as never,
    readRun: vi.fn() as never,
    test: vi.fn() as never,
    readTest: vi.fn() as never,
    checkpoint: vi.fn() as never,
  };
}
function mount(props: { canManage: boolean; active: boolean }) {
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
          selection={props.active ? selection : null}
          api={api(props.active)}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('offers hosts one compact setup row without field labels before a resource opens', async () => {
  mount({ canManage: true, active: false });
  expect(await screen.findByText(t.setupTitle)).toBeTruthy();
  expect(screen.getByRole('combobox', { name: t.resource })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: t.language })).toBeTruthy();
  expect(screen.getByRole('button', { name: t.open })).toBeTruthy();
  expect(screen.getByRole('button', { name: t.create })).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.close })).toBeNull();
  expect(screen.queryByText(t.chooseResource)).toBeNull();
  expect(screen.queryByTestId('workbench')).toBeNull();
});

it('tells participants to wait for the host instead of showing controls', async () => {
  mount({ canManage: false, active: false });
  expect((await screen.findByText(t.chooseResource)).getAttribute('role')).toBe(
    'status'
  );
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('hides the setup row once a resource is open and moves host actions into the workbench menu', async () => {
  mount({ canManage: true, active: true });
  await screen.findByTestId('workbench');
  expect(screen.queryByText(t.setupTitle)).toBeNull();
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

it('gives participants no host actions', async () => {
  mount({ canManage: false, active: true });
  await screen.findByTestId('workbench');
  await waitFor(() => expect(workbench.calls.length).toBeGreaterThan(0));
  expect(workbench.calls.at(-1)!.actions).toEqual([]);
});
