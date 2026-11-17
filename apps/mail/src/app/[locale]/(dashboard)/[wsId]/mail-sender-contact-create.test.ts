// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MailActorProvider } from '@/components/mail-actor-provider';
import { MailSenderContactCreate } from './mail-sender-contact-create';

const api = vi.hoisted(() => ({
  capability: vi.fn(),
  create: vi.fn(),
  status: vi.fn(),
  workspaces: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaces: api.workspaces,
}));
vi.mock('@tuturuuu/internal-api/people', () => ({
  getContactCreateCapability: api.capability,
  createSenderContact: api.create,
  getSenderContactOperation: api.status,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

beforeEach(() => {
  sessionStorage.clear();
  api.capability.mockResolvedValue({ canCreate: true });
  api.create.mockResolvedValue({ state: 'unknown' });
  api.status.mockResolvedValue({ state: 'unknown' });
  api.workspaces.mockResolvedValue([
    { id: 'workspace', name: 'Team', personal: false },
  ]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const onCreated = vi.fn();

function setup(actorId = 'actor') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    h(
      QueryClientProvider,
      { client },
      h(
        MailActorProvider,
        { actorId },
        h(MailSenderContactCreate, {
          routeWorkspaceId: 'workspace',
          email: 'sender@example.com',
          headerName: 'Nguyễn Thị Lan',
          contactsHref: (workspaceId: string) =>
            `https://contacts.example/en/${workspaceId}/users/database`,
          onCreated,
        })
      )
    )
  );
}

async function openForm() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'add_to_contacts' })
  );
  const submit = await screen.findByRole('button', { name: 'create' });
  await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
  return submit;
}

it('prefills the form from the From header', async () => {
  setup();
  await openForm();
  expect((screen.getByLabelText('name') as HTMLInputElement).value).toBe(
    'Nguyễn Thị Lan'
  );
  expect((screen.getByLabelText('email') as HTMLInputElement).readOnly).toBe(
    true
  );
});

it('submits once, retains UNKNOWN and only reads status on checks and reopen', async () => {
  const view = setup();
  fireEvent.click(await openForm());
  await screen.findByText('outcome_unknown');
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(api.create.mock.calls[0]?.[1]).toMatchObject({
    email: 'sender@example.com',
    displayName: 'Nguyễn Thị Lan',
  });
  const operationId = api.create.mock.calls[0]?.[1].operationId;
  expect(operationId).toEqual(expect.any(String));
  fireEvent.click(screen.getByRole('button', { name: 'check_status' }));
  await waitFor(() =>
    expect(api.status).toHaveBeenCalledWith('workspace', operationId)
  );
  expect(api.create).toHaveBeenCalledTimes(1);
  view.unmount();
  setup();
  fireEvent.click(await openForm());
  await screen.findByText('outcome_unknown');
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(api.status).toHaveBeenCalledTimes(2);
});

it('reports a late-confirmed contact without replaying the mutation', async () => {
  setup();
  fireEvent.click(await openForm());
  await screen.findByText('outcome_unknown');
  api.status.mockResolvedValue({ state: 'created', contactId: 'contact/id' });
  fireEvent.click(screen.getByRole('button', { name: 'check_status' }));
  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      contactId: 'contact/id',
      workspaceName: 'Team',
    })
  );
  expect(api.create).toHaveBeenCalledTimes(1);
});

it('hides creation when capability is denied and never submits automatically', async () => {
  api.capability.mockRejectedValue({ status: 403 });
  setup();
  await waitFor(() => expect(api.capability).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button')).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
});
