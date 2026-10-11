// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api', () => ({ connectedMailRequest: request }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { ConnectedMailCompose } from './connected-mail-compose';
import { ConnectedMailSendDraft } from './connected-mail-send-draft';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('uses the connected account transport and keeps unsent edits after a send failure', async () => {
  request.mockRejectedValueOnce(new Error('Provider unavailable'));
  const sent = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client: cache },
      createElement(ConnectedMailCompose, {
        workspaceId: 'personal',
        accountId: 'account',
        address: 'me@example.test',
        onClose: vi.fn(),
        onSent: sent,
      })
    )
  );
  fireEvent.change(screen.getByLabelText('connected_to'), {
    target: { value: 'recipient@example.test' },
  });
  fireEvent.change(screen.getByLabelText('connected_body'), {
    target: { value: 'Keep my edits' },
  });
  fireEvent.click(screen.getByText('send'));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Provider unavailable'
    )
  );
  expect(
    (screen.getByLabelText('connected_body') as HTMLTextAreaElement).value
  ).toBe('Keep my edits');
  expect(sent).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith(
    'personal',
    ['account', 'send'],
    expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        to: ['recipient@example.test'],
        text: 'Keep my edits',
      }),
    })
  );
});

function mountCompose() {
  request.mockResolvedValue({});
  const cache = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client: cache },
      createElement(ConnectedMailCompose, {
        workspaceId: 'personal',
        accountId: 'account',
        address: 'me@example.test',
        onClose: vi.fn(),
        onSent: vi.fn(),
      })
    )
  );
  fireEvent.change(screen.getByLabelText('connected_to'), {
    target: { value: 'recipient@example.test' },
  });
  return {
    input: screen.getByLabelText('connected_attachments'),
    send: screen.getByText('send') as HTMLButtonElement,
    save: screen.getByText('connected_save_draft') as HTMLButtonElement,
  };
}

function deferredFile(name: string) {
  let resolve!: (value: ArrayBuffer) => void;
  let reject!: (reason: Error) => void;
  const buffer = new Promise<ArrayBuffer>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const file = new File(['synthetic'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'arrayBuffer', { value: () => buffer });
  return { file, resolve, reject };
}

it('holds Send and Save until selected attachment bytes are ready', async () => {
  const compose = mountCompose();
  const pending = deferredFile('selected.txt');
  fireEvent.change(compose.input, { target: { files: [pending.file] } });
  expect(compose.send.disabled).toBe(true);
  expect(compose.save.disabled).toBe(true);
  fireEvent.click(compose.send);
  fireEvent.click(compose.save);
  expect(request).not.toHaveBeenCalled();
  await act(async () => pending.resolve(new Uint8Array([65]).buffer));
  expect(compose.send.disabled).toBe(false);
  expect(compose.save.disabled).toBe(false);
  fireEvent.click(compose.send);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0]?.[2].body.attachments).toEqual([
    { filename: 'selected.txt', contentType: 'text/plain', base64: 'QQ==' },
  ]);
});

it('keeps the latest selection when an earlier read finishes later', async () => {
  const compose = mountCompose();
  const previous = deferredFile('previous.txt');
  const current = deferredFile('current.txt');
  fireEvent.change(compose.input, { target: { files: [previous.file] } });
  fireEvent.change(compose.input, { target: { files: [current.file] } });
  await act(async () => current.resolve(new Uint8Array([66]).buffer));
  await act(async () => previous.resolve(new Uint8Array([65]).buffer));
  expect(compose.send.disabled).toBe(false);
  fireEvent.click(compose.send);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0]?.[2].body.attachments).toEqual([
    { filename: 'current.txt', contentType: 'text/plain', base64: 'Qg==' },
  ]);
});

it('shows read failure and holds Send and Save instead of dropping selected files', async () => {
  const compose = mountCompose();
  const previous = deferredFile('previous.txt');
  fireEvent.change(compose.input, { target: { files: [previous.file] } });
  await act(async () => previous.resolve(new Uint8Array([65]).buffer));
  const failing = deferredFile('unreadable.txt');
  fireEvent.change(compose.input, { target: { files: [failing.file] } });
  await act(async () => failing.reject(new Error('Synthetic read failure')));
  expect(screen.getByRole('alert').textContent).toBe(
    'connected_attachment_read_error'
  );
  expect(compose.send.disabled).toBe(true);
  expect(compose.save.disabled).toBe(true);
  fireEvent.click(compose.send);
  fireEvent.click(compose.save);
  expect(request).not.toHaveBeenCalled();
});

function heldRequest() {
  let resolve!: (result: object) => void;
  const promise = new Promise<object>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

it.each(['send', 'connected_save_draft'])(
  'ignores an obsolete %s completion after replacing the account composer',
  async (action) => {
    const pending = heldRequest();
    request.mockReturnValueOnce(pending.promise).mockResolvedValue({});
    const previousSent = vi.fn();
    const currentSent = vi.fn();
    const cache = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const composer = (accountId: string, onSent: () => void) =>
      createElement(
        QueryClientProvider,
        { client: cache },
        createElement(ConnectedMailCompose, {
          key: accountId,
          workspaceId: 'personal',
          accountId,
          address: `${accountId}@example.test`,
          onClose: vi.fn(),
          onSent,
        })
      );
    const view = render(composer('previous', previousSent));
    fireEvent.change(screen.getByLabelText('connected_to'), {
      target: { value: 'recipient@example.test' },
    });
    fireEvent.click(screen.getByText(action));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    view.rerender(composer('current', currentSent));
    fireEvent.change(screen.getByLabelText('connected_body'), {
      target: { value: 'Keep the replacement draft' },
    });
    await act(async () => pending.resolve({}));
    expect(previousSent).not.toHaveBeenCalled();
    expect(currentSent).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText('connected_body') as HTMLTextAreaElement).value
    ).toBe('Keep the replacement draft');
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('connected_to'), {
      target: { value: 'recipient@example.test' },
    });
    fireEvent.click(screen.getByText(action));
    await waitFor(() => expect(currentSent).toHaveBeenCalledTimes(1));
    expect(previousSent).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
  }
);

it('ignores a sent-draft completion after replacing the selected detail', async () => {
  const pending = heldRequest();
  request.mockReturnValueOnce(pending.promise).mockResolvedValue({});
  const previousSent = vi.fn();
  const currentSent = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const selected = (draftId: string, onSent: () => void) =>
    createElement(
      QueryClientProvider,
      { client: cache },
      createElement(ConnectedMailSendDraft, {
        key: draftId,
        workspaceId: 'personal',
        accountId: 'account',
        draftId,
        onSent,
      })
    );
  const view = render(selected('previous', previousSent));
  fireEvent.click(screen.getByText('send'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  view.rerender(selected('current', currentSent));
  await act(async () => pending.resolve({}));
  expect(previousSent).not.toHaveBeenCalled();
  expect(currentSent).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('send'));
  await waitFor(() => expect(currentSent).toHaveBeenCalledTimes(1));
  expect(previousSent).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(2);
});
