// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { MailMailbox } from '@tuturuuu/internal-api';
import { createElement as h } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingComposer } from './floating-composer';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createMailDraft: api.create,
  updateMailDraft: api.update,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: api.toast } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./mail-composer-header', () => ({
  MailComposerHeader: (props: { onRequestClose: () => void }) =>
    h('button', { type: 'button', onClick: props.onRequestClose }, 'Close'),
}));
vi.mock('./mail-composer-editor', () => ({
  MailComposerEditor: (props: {
    initialHtml: string;
    onChange: (value: { html: string; text: string }) => void;
  }) =>
    h('textarea', {
      'aria-label': 'Body',
      value: props.initialHtml,
      onChange: (e: { target: { value: string } }) =>
        props.onChange({ html: e.target.value, text: e.target.value }),
    }),
}));
vi.mock('./mail-composer-footer', () => ({ MailComposerFooter: () => null }));
vi.mock('./mail-composer-attachments', () => ({
  MailComposerAttachments: () => null,
}));
vi.mock('./mail-composer-send-review', () => ({
  MailComposerSendReview: () => null,
}));
vi.mock('./recipient-field', () => ({ RecipientField: () => null }));
vi.mock('@tuturuuu/ui/select', () => ({
  Select: () => null,
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
function mount(initialDraft?: { draftId?: string; bodyHtml?: string }) {
  const close = vi.fn();
  render(
    h(FloatingComposer, {
      open: true,
      initialDraft,
      mailboxes: [mailbox],
      selectedMailboxId: mailbox.id,
      sending: false,
      workspaceId: 'personal',
      onOpenChange: close,
      onSend: vi.fn(),
    })
  );
  return close;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.create.mockResolvedValue({ message: { id: 'saved' } });
  api.update.mockResolvedValue({ message: { id: 'existing' } });
});
afterEach(cleanup);
describe('save on composer close', () => {
  it('closes untouched without creating an empty draft', async () => {
    const close = mount();
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(api.create).not.toHaveBeenCalled();
  });
  it('waits for the latest draft before closing', async () => {
    let finish!: (value: unknown) => void;
    api.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const close = mount();
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: '<p>Keep this reply</p>' },
    });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish({ message: { id: 'saved' } }));
    expect(close).toHaveBeenCalledWith(false);
    expect(api.create.mock.calls[0]?.[2].bodyHtml).toBe(
      '<p>Keep this reply</p>'
    );
  });
  it('keeps failed existing draft updates open with their latest contents', async () => {
    api.update.mockRejectedValue(new Error('Unavailable'));
    const close = mount({ draftId: 'existing', bodyHtml: '<p>Old</p>' });
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: '<p>New content</p>' },
    });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith('save_failed'));
    expect(close).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update.mock.calls[0]?.[2]).toBe('existing');
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe(
      '<p>New content</p>'
    );
  });
});
