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
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
          workspaceId: 'workspace',
          email: 'sender@example.com',
          displayName: 'Sender',
          contactsHref: 'https://contacts.example/en/workspace/users/database',
          onCreated: vi.fn(),
        })
      )
    )
  );
}

it('submits once, retains UNKNOWN and only reads status on checks and reopen', async () => {
  const view = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'add' }));
  await screen.findByText('outcome_unknown');
  expect(api.create).toHaveBeenCalledTimes(1);
  const operationId = api.create.mock.calls[0]?.[1].operationId;
  expect(operationId).toEqual(expect.any(String));
  fireEvent.click(screen.getByRole('button', { name: 'check_status' }));
  await waitFor(() =>
    expect(api.status).toHaveBeenCalledWith('workspace', operationId)
  );
  expect(api.create).toHaveBeenCalledTimes(1);
  view.unmount();
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'add' }));
  await screen.findByText('outcome_unknown');
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(api.status).toHaveBeenCalledTimes(2);
});

it('opens a late-confirmed contact without replaying the mutation', async () => {
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'add' }));
  await screen.findByText('outcome_unknown');
  api.status.mockResolvedValue({ state: 'created', contactId: 'contact/id' });
  fireEvent.click(screen.getByRole('button', { name: 'check_status' }));
  expect(
    (await screen.findByRole('link', { name: 'open' })).getAttribute('href')
  ).toBe('https://contacts.example/en/workspace/users/database/contact%2Fid');
  expect(api.create).toHaveBeenCalledTimes(1);
});

it('hides creation when capability is denied and never submits automatically', async () => {
  api.capability.mockRejectedValue({ status: 403 });
  setup();
  await waitFor(() => expect(api.capability).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button')).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
});
