// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { MailAttachment, MailMailbox } from '@tuturuuu/internal-api';
import { createElement as h, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingComposer } from './floating-composer';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  remove: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createMailDraft: api.create,
  updateMailDraft: api.update,
  copyMailDraftAttachments: vi.fn(),
  deleteMailDraftAttachment: api.remove,
  uploadMailDraftAttachment: vi.fn(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: api.toast } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./mail-composer-header', () => ({ MailComposerHeader: () => null }));
vi.mock('./mail-composer-editor', () => ({
  MailComposerEditor: (props: {
    initialHtml: string;
    onChange: (value: { html: string; text: string }) => void;
  }) =>
    h('textarea', {
      'aria-label': 'Body',
      value: props.initialHtml,
      onChange: (event: { target: { value: string } }) =>
        props.onChange({ html: event.target.value, text: event.target.value }),
    }),
}));
vi.mock('./mail-composer-footer', () => ({ MailComposerFooter: () => null }));
vi.mock('./mail-composer-attachments', () => ({
  MailComposerAttachments: (props: {
    attachments: MailAttachment[];
    onRemove: (attachment: MailAttachment) => Promise<void>;
  }) =>
    h(
      'div',
      null,
      props.attachments.map((attachment) =>
        h(
          'button',
          {
            key: attachment.id,
            type: 'button',
            onClick: () => void props.onRemove(attachment),
          },
          `Remove ${attachment.filename}`
        )
      )
    ),
}));
vi.mock('./mail-composer-send-review', () => ({
  MailComposerSendReview: () => null,
}));
vi.mock('./recipient-field', () => ({ RecipientField: () => null }));
vi.mock('@tuturuuu/ui/select', () => ({
  Select: (props: {
    disabled: boolean;
    onValueChange: (value: string) => void;
  }) =>
    h(
      'button',
      {
        disabled: props.disabled,
        type: 'button',
        onClick: () => props.onValueChange('mailbox-next'),
      },
      'Use alternate mailbox'
    ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
const mailbox = {
  id: 'mailbox',
  address: 'sender@example.com',
  role: 'owner',
  status: 'active',
  signatureHtml: null,
  signatureText: null,
  providerLimits: { maxRecipients: 50, maxMessageBytes: 5000000 },
} as MailMailbox;
const initialDraft = {
  draftId: 'draft',
  to: ['recipient@example.com'],
  subject: 'Status',
  bodyHtml: 'First body',
  bodyText: 'First body',
};
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
function mount(withAttachment = false) {
  function App() {
    const [open, setOpen] = useState(true);
    return open
      ? h(FloatingComposer, {
          open,
          initialDraft: withAttachment
            ? {
                ...initialDraft,
                attachments: [
                  {
                    id: 'attachment',
                    filename: 'notes.txt',
                    sizeBytes: 4,
                  } as MailAttachment,
                ],
              }
            : initialDraft,
          mailboxes: [mailbox, { ...mailbox, id: 'mailbox-next' }],
          selectedMailboxId: mailbox.id,
          sending: false,
          workspaceId: 'personal',
          onOpenChange: setOpen,
          onSend: api.send,
        })
      : h('p', null, 'Composer closed');
  }
  render(h(App));
}
function body() {
  return screen.getByLabelText('Body') as HTMLTextAreaElement;
}
function edit(value: string) {
  fireEvent.change(body(), { target: { value } });
}
async function sendShortcut() {
  fireEvent.keyDown(body(), { key: 'Enter', ctrlKey: true });
  await act(async () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}
function holdSave() {
  let resolve!: (value: { message: { id: string } }) => void;
  let reject!: (reason: Error) => void;
  api.update.mockImplementationOnce(
    () =>
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      })
  );
  return {
    resolve: () => resolve({ message: { id: 'draft' } }),
    reject: (reason: Error) => reject(reason),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  frames.clear();
  nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  api.update.mockResolvedValue({ message: { id: 'draft' } });
  api.send.mockResolvedValue(undefined);
  api.create.mockResolvedValue({ message: { id: 'draft-next' } });
  api.remove.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  frames.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('composer Send while saving a draft', () => {
  it('keeps a raced edit open until another explicit Send', async () => {
    const save = holdSave();
    mount();
    edit('Before send');
    await sendShortcut();
    expect(api.update.mock.calls[0]?.[3].bodyHtml).toBe('Before send');
    edit('Latest body');
    await act(async () => save.resolve());
    expect(body().value).toBe('Latest body');
    expect(screen.getByRole('dialog', { name: 'new_message' })).not.toBeNull();
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.queryByText('Composer closed')).toBeNull();
    await sendShortcut();
    expect(api.send).toHaveBeenCalledExactlyOnceWith(
      'mailbox',
      expect.objectContaining({
        bodyHtml: 'Latest body',
        bodyText: 'Latest body',
        draftId: 'draft',
        subject: 'Status',
        to: ['recipient@example.com'],
      })
    );
    expect(screen.getByText('Composer closed').textContent).toBe(
      'Composer closed'
    );
  });
  it('sends the saved content and closes when it was unchanged while saving', async () => {
    const save = holdSave();
    mount();
    edit('Before send');
    await sendShortcut();
    expect(body().value).toBe('Before send');
    expect(api.send).not.toHaveBeenCalled();
    await act(async () => save.resolve());
    expect(api.send).toHaveBeenCalledExactlyOnceWith(
      'mailbox',
      expect.objectContaining({
        bodyHtml: 'Before send',
        bodyText: 'Before send',
        draftId: 'draft',
        subject: 'Status',
        to: ['recipient@example.com'],
      })
    );
    expect(screen.getByText('Composer closed').textContent).toBe(
      'Composer closed'
    );
  });
  it('preserves content and stays open when saving fails', async () => {
    const save = holdSave();
    mount();
    edit('Keep this body');
    await sendShortcut();
    expect(api.update.mock.calls[0]?.[3].bodyHtml).toBe('Keep this body');
    await act(async () => save.reject(new Error('Synthetic save failure')));
    expect(body().value).toBe('Keep this body');
    expect(screen.getByRole('dialog', { name: 'new_message' })).not.toBeNull();
    expect(api.toast).toHaveBeenCalledWith('save_failed');
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.queryByText('Composer closed')).toBeNull();
  });

  it('keeps a mailbox change during a held save open until explicit Send', async () => {
    const save = holdSave();
    mount();
    edit('Before mailbox change');
    await sendShortcut();
    expect(api.update.mock.calls[0]?.[3].bodyHtml).toBe(
      'Before mailbox change'
    );
    fireEvent.click(screen.getByText('Use alternate mailbox'));
    await act(async () => save.resolve());
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.queryByText('Composer closed')).toBeNull();
    expect(body().value).toBe('Before mailbox change');
    expect(screen.getByRole('dialog', { name: 'new_message' })).not.toBeNull();
    await sendShortcut();
    expect(api.create).toHaveBeenCalledExactlyOnceWith(
      'personal',
      'mailbox-next',
      expect.objectContaining({ bodyHtml: 'Before mailbox change' })
    );
    expect(api.send).toHaveBeenCalledExactlyOnceWith(
      'mailbox-next',
      expect.objectContaining({
        draftId: 'draft-next',
        bodyHtml: 'Before mailbox change',
      })
    );
    expect(screen.getByText('Composer closed').textContent).toBe(
      'Composer closed'
    );
  });
  it('invalidates a pending Send before attachment deletion completes', async () => {
    let finishRemoval!: () => void;
    api.remove.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRemoval = resolve;
        })
    );
    const save = holdSave();
    mount(true);
    edit('Before removal');
    await sendShortcut();
    expect(api.update.mock.calls[0]?.[3].bodyHtml).toBe('Before removal');
    fireEvent.click(screen.getByText('Remove notes.txt'));
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(
      'personal',
      'mailbox',
      'draft',
      'attachment'
    );
    await act(async () => save.resolve());
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.queryByText('Composer closed')).toBeNull();
    expect(screen.getByText('Remove notes.txt')).not.toBeNull();
    await act(async () => finishRemoval());
    expect(screen.queryByText('Remove notes.txt')).toBeNull();
    expect(body().value).toBe('Before removal');
    expect(api.send).not.toHaveBeenCalled();
    await sendShortcut();
    expect(api.send).toHaveBeenCalledExactlyOnceWith(
      'mailbox',
      expect.objectContaining({
        draftId: 'draft',
        bodyHtml: 'Before removal',
      })
    );
    expect(screen.getByText('Composer closed').textContent).toBe(
      'Composer closed'
    );
  });
});
