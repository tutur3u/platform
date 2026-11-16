// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { MailAttachment, MailMailbox } from '@tuturuuu/internal-api';
import { createElement as h, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingComposer } from './floating-composer';
import type { MailImageNodes } from './mail-composer-image-nodes';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  toast: vi.fn(),
  editor: {
    attachments: [] as unknown[],
    onChange: null as null | ((value: { html: string; text: string }) => void),
    onRemoveImage: null as null | ((id: string) => void),
  },
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createMailDraft: api.create,
  updateMailDraft: api.update,
  copyMailDraftAttachments: vi.fn(),
  deleteMailDraftAttachment: api.remove,
  uploadMailDraftAttachment: api.upload,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: api.toast } }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('./mail-composer-header', () => ({ MailComposerHeader: () => null }));

const nodes = {
  insertPending: vi.fn(() => true),
  inspect: vi.fn((): { attachmentId: string | null } | null => null),
  liveIds: vi.fn(() => new Set<string>()),
  references: vi.fn(() => 0),
  remove: vi.fn(() => true),
  removeReferences: vi.fn(),
  resolve: vi.fn(() => true),
  setRemoving: vi.fn(),
  setSize: vi.fn(),
  setState: vi.fn(),
} satisfies MailImageNodes;
vi.mock('./mail-composer-editor', () => ({
  MailComposerEditor: (props: {
    attachments?: unknown[];
    initialHtml: string;
    onChange: (value: { html: string; text: string }) => void;
    onImageNodes: (value: MailImageNodes | null) => void;
    onRemoveImage: (id: string) => void;
  }) => {
    api.editor.onChange = props.onChange;
    api.editor.onRemoveImage = props.onRemoveImage;
    api.editor.attachments.push(props.attachments);
    useEffect(() => {
      props.onImageNodes(nodes);
      return () => props.onImageNodes(null);
    }, [props.onImageNodes]);
    return h('textarea', {
      'aria-label': 'Body',
      value: props.initialHtml,
      onChange: (event: { target: { value: string } }) =>
        props.onChange({ html: event.target.value, text: event.target.value }),
    });
  },
}));
vi.mock('./mail-composer-footer', () => ({
  MailComposerFooter: (props: {
    canSend: boolean;
    mediaFailed: number;
    mediaPending: number;
    onSend: () => void;
    onUpload: (files: File[], inline?: boolean) => void;
  }) =>
    h(
      'div',
      null,
      h(
        'button',
        { disabled: !props.canSend, onClick: props.onSend, type: 'button' },
        'Send'
      ),
      h(
        'button',
        {
          onClick: () =>
            props.onUpload(
              [new File(['x'], 'photo.png', { type: 'image/png' })],
              true
            ),
          type: 'button',
        },
        'Add image'
      ),
      h(
        'button',
        {
          onClick: () =>
            props.onUpload([
              new File(['x'], 'notes.pdf', { type: 'application/pdf' }),
            ]),
          type: 'button',
        },
        'Add file'
      ),
      h(
        'output',
        null,
        `pending:${props.mediaPending} failed:${props.mediaFailed}`
      )
    ),
}));
vi.mock('./mail-composer-attachments', () => ({
  MailComposerAttachments: (props: {
    items: { id: string; name: string; status: string }[];
    onRemove: (id: string) => void;
    onRetry: (id: string) => void;
  }) =>
    h(
      'ul',
      null,
      props.items.flatMap((item) => [
        h('li', { key: item.id }, `${item.status}:${item.name}`),
        h(
          'button',
          {
            key: `${item.id}-retry`,
            onClick: () => props.onRetry(item.id),
            type: 'button',
          },
          `Retry ${item.name}`
        ),
        h(
          'button',
          {
            key: `${item.id}-remove`,
            onClick: () => props.onRemove(item.id),
            type: 'button',
          },
          `Remove ${item.name}`
        ),
      ])
    ),
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
const draft = {
  draftId: 'draft',
  to: ['recipient@example.com'],
  subject: 'Status',
  bodyHtml: '<p>Hello</p>',
  bodyText: 'Hello',
};
const attachment = (id: string, disposition: 'attachment' | 'inline') =>
  ({
    contentId: null,
    contentType: 'image/png',
    disposition,
    filename: `${id}.png`,
    id,
    protectedUrl: null,
    sizeBytes: 4,
  }) satisfies MailAttachment;

interface Upload {
  fail: () => void;
  options: { fetch: typeof fetch };
  succeed: (disposition?: 'attachment' | 'inline') => void;
}
const uploads: Upload[] = [];

function mount(initialDraft: Record<string, unknown> = draft) {
  const props = {
    initialDraft,
    mailboxes: [mailbox],
    onOpenChange: vi.fn(),
    onSend: api.send,
    open: true,
    selectedMailboxId: mailbox.id,
    sending: false,
    workspaceId: 'personal',
  };
  const view = render(h(FloatingComposer, props));
  return {
    ...view,
    close: () => view.rerender(h(FloatingComposer, { ...props, open: false })),
    /** Closed, then opened again on another workspace and draft. */
    reopenElsewhere: () => {
      view.rerender(h(FloatingComposer, { ...props, open: false }));
      view.rerender(
        h(FloatingComposer, {
          ...props,
          initialDraft: { ...draft, draftId: 'draft-2' },
          workspaceId: 'other',
        })
      );
    },
  };
}
const settle = () =>
  act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const send = () => screen.getByText('Send') as HTMLButtonElement;
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
async function sendShortcut() {
  fireEvent.keyDown(screen.getByLabelText('Body'), {
    ctrlKey: true,
    key: 'Enter',
  });
  await act(async () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}
const emit = (html: string) =>
  act(() => api.editor.onChange?.({ html, text: 'text' }));

class FakeImage {
  naturalWidth = 640;
  naturalHeight = 480;
  decode = () => Promise.resolve();
  set src(_value: string) {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  uploads.length = 0;
  api.editor.attachments.length = 0;
  frames.clear();
  nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}'))
  );
  api.update.mockResolvedValue({ message: { id: 'draft' } });
  api.create.mockResolvedValue({ message: { id: 'draft' } });
  api.send.mockResolvedValue(undefined);
  api.remove.mockResolvedValue(undefined);
  api.upload.mockImplementation(
    (
      _workspace: string,
      _mailbox: string,
      _draft: string,
      _file: File,
      _name: string,
      metadata: { disposition: 'attachment' | 'inline' },
      options: Upload['options']
    ) =>
      new Promise((resolve, reject) => {
        const index = uploads.length + 1;
        uploads.push({
          fail: () => reject(new Error('network')),
          options,
          succeed: (disposition = metadata.disposition) =>
            resolve({ attachment: attachment(`att${index}`, disposition) }),
        });
      })
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('send waits for media', () => {
  it('disables Send while queued or uploading and enables it once settled', async () => {
    mount();
    fireEvent.click(screen.getByText('Add image'));
    fireEvent.click(screen.getByText('Add file'));
    await settle();
    expect(send().disabled).toBe(true);
    expect(screen.getByText('pending:2 failed:0')).not.toBeNull();
    await sendShortcut();
    await settle();
    expect(api.send).not.toHaveBeenCalled();
    await act(async () => uploads[0]?.succeed());
    await settle();
    expect(send().disabled).toBe(true);
    await act(async () => uploads[1]?.succeed());
    await settle();
    expect(send().disabled).toBe(false);
  });

  it('blocks Send for a failed upload until it is retried or removed', async () => {
    mount();
    fireEvent.click(screen.getByText('Add file'));
    await settle();
    await act(async () => uploads[0]?.fail());
    await settle();
    expect(screen.getByText('failed:notes.pdf')).not.toBeNull();
    expect(screen.getByText('pending:0 failed:1')).not.toBeNull();
    expect(send().disabled).toBe(true);
    // Retry runs a second upload for the same item.
    fireEvent.click(screen.getByText('Retry notes.pdf'));
    await settle();
    expect(uploads).toHaveLength(2);
    await act(async () => uploads[1]?.fail());
    await settle();
    // Removing a failed item sends no delete: its server outcome is unknown.
    fireEvent.click(screen.getByText('Remove notes.pdf'));
    await settle();
    expect(api.remove).not.toHaveBeenCalled();
    expect(send().disabled).toBe(false);
  });

  it('keeps a pending Send from completing once an upload starts', async () => {
    let finishSave!: (value: { message: { id: string } }) => void;
    api.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        })
    );
    mount();
    emit('<p>Edited</p>');
    await sendShortcut();
    await settle();
    fireEvent.click(screen.getByText('Add file'));
    await act(async () => finishSave({ message: { id: 'draft' } }));
    await settle();
    expect(api.send).not.toHaveBeenCalled();
  });
});

describe('draft serialization', () => {
  it('never saves or sends a placeholder, blob or local metadata', async () => {
    mount();
    fireEvent.click(screen.getByText('Add image'));
    await settle();
    emit(
      '<p>Hi</p><img src="blob:preview" data-mail-upload="uploading"><p>more</p>'
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    const saved = api.update.mock.calls.at(-1)?.[3];
    expect(saved.bodyHtml).toBe('<p>Hi</p><p>more</p>');
    expect(JSON.stringify(saved)).not.toMatch(
      /blob:|data-mail-upload|uploadId/u
    );
    await act(async () => uploads[0]?.succeed());
    await settle();
    await sendShortcut();
    await settle();
    const sent = api.send.mock.calls[0]?.[1];
    expect(sent.bodyHtml).toBe('<p>Hi</p><p>more</p>');
    expect(JSON.stringify(sent)).not.toMatch(
      /blob:|data-mail-upload|uploadId/u
    );
  });

  it('asks the editor for a placeholder and later swaps it by the same id', async () => {
    mount();
    fireEvent.click(screen.getByText('Add image'));
    await settle();
    const first = nodes.insertPending.mock.calls[0] as unknown as [
      { src: string; state: string; uploadId: string },
    ];
    expect(first[0]).toMatchObject({ src: 'blob:preview', state: 'queued' });
    await act(async () => uploads[0]?.succeed());
    await settle();
    expect(nodes.resolve).toHaveBeenCalledWith(
      first[0].uploadId,
      '/api/v1/workspaces/personal/mail/mailboxes/mailbox/drafts/draft/attachments/att1'
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});

describe('attachments and inline images', () => {
  it('shows an uploaded inline image in the editor only, not as a chip', async () => {
    mount();
    fireEvent.click(screen.getByText('Add image'));
    await settle();
    expect(screen.queryByText(/photo\.png/u)).toBeNull();
    await act(async () => uploads[0]?.succeed());
    await settle();
    // The editor emitted the settled image, so no duplicate chip appears.
    emit(
      '<p><img src="/api/v1/workspaces/personal/mail/mailboxes/mailbox/drafts/draft/attachments/att1"></p>'
    );
    expect(screen.queryByText(/photo\.png/u)).toBeNull();
    // If the body loses the image, the attachment stays reachable as a chip.
    emit('<p>gone</p>');
    expect(screen.getByText('uploaded:photo.png')).not.toBeNull();
  });

  it('shows pending attachments as chips immediately', async () => {
    mount();
    fireEvent.click(screen.getByText('Add file'));
    // The chip exists before any request has resolved.
    expect(screen.getByText('uploading:notes.pdf')).not.toBeNull();
    await settle();
    await act(async () => uploads[0]?.succeed());
    await settle();
    expect(screen.getByText('uploaded:notes.pdf')).not.toBeNull();
  });
});

describe('optimistic removal', () => {
  it('removes a chip at once and restores it with a toast when the delete fails', async () => {
    api.remove.mockRejectedValueOnce(new Error('offline'));
    mount({ ...draft, attachments: [attachment('a', 'attachment')] });
    fireEvent.click(screen.getByText('Remove a.png'));
    expect(screen.queryByText('Remove a.png')).toBeNull();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(
      'personal',
      'mailbox',
      'draft',
      'a'
    );
    await settle();
    expect(screen.getByText('uploaded:a.png')).not.toBeNull();
    expect(api.toast).toHaveBeenCalledWith(
      'remove_failed',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'retry' }),
      })
    );
    // Try again repeats the same removal.
    const action = api.toast.mock.calls[0]?.[1].action;
    await act(async () => action.onClick());
    await settle();
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Remove a.png')).toBeNull();
  });

  it('removes an orphaned inline image through its chip and restores it on failure', async () => {
    api.remove.mockRejectedValueOnce(new Error('offline'));
    mount({ ...draft, attachments: [attachment('img', 'inline')] });
    emit(
      '<img src="/api/v1/workspaces/personal/mail/mailboxes/mailbox/drafts/draft/attachments/img">'
    );
    expect(screen.queryByText(/img\.png/u)).toBeNull();
    // The chip exists only if the body lost the image.
    emit('<p>x</p>');
    fireEvent.click(screen.getByText('Remove img.png'));
    expect(screen.queryByText('Remove img.png')).toBeNull();
    await settle();
    expect(screen.getByText('uploaded:img.png')).not.toBeNull();
  });

  it('removes an editor image by instance id and restores that node on failure', async () => {
    api.remove.mockRejectedValueOnce(new Error('offline'));
    nodes.inspect.mockReturnValueOnce({ attachmentId: 'img' });
    mount({ ...draft, attachments: [attachment('img', 'inline')] });
    act(() => api.editor.onRemoveImage?.('node-1'));
    expect(nodes.setRemoving).toHaveBeenCalledWith('node-1', true);
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(
      'personal',
      'mailbox',
      'draft',
      'img'
    );
    await settle();
    expect(nodes.setRemoving).toHaveBeenCalledWith('node-1', false);
    expect(nodes.remove).not.toHaveBeenCalled();
    // Removing makes the draft dirty like any other edit.
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(api.update).toHaveBeenCalled();
  });

  it('keeps the attachment when another node still shows it', async () => {
    nodes.inspect.mockReturnValueOnce({ attachmentId: 'img' });
    nodes.references.mockReturnValueOnce(1);
    mount({ ...draft, attachments: [attachment('img', 'inline')] });
    act(() => api.editor.onRemoveImage?.('node-2'));
    expect(nodes.remove).toHaveBeenCalledWith('node-2');
    await settle();
    expect(api.remove).not.toHaveBeenCalled();
  });
});

describe('late results after the composer was reopened elsewhere', () => {
  it('deletes a late cancelled upload from the draft that received it', async () => {
    const view = mount();
    fireEvent.click(screen.getByText('Add image'));
    await settle();
    view.reopenElsewhere();
    await act(async () => uploads[0]?.succeed());
    await settle();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(
      'personal',
      'mailbox',
      'draft',
      'att1'
    );
    expect(api.remove).not.toHaveBeenCalledWith(
      'other',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });
});

describe('editor attachments reference', () => {
  it('stays the same through status-only upload updates', async () => {
    mount({
      ...draft,
      quotedAttachments: [attachment('quoted', 'attachment')],
    });
    const seen = () => new Set(api.editor.attachments);
    expect(seen().size).toBe(1);
    fireEvent.click(screen.getByText('Add file'));
    await settle();
    await act(async () => uploads[0]?.fail());
    await settle();
    fireEvent.click(screen.getByText('Retry notes.pdf'));
    await settle();
    // queued, uploading, failed and queued again: nothing uploaded changed.
    expect(api.editor.attachments.length).toBeGreaterThan(3);
    expect(seen().size).toBe(1);
    await act(async () => uploads[1]?.succeed());
    await settle();
    expect(seen().size).toBe(2);
    const latest = api.editor.attachments.at(-1) as { id: string }[];
    expect(latest.map((entry) => entry.id)).toEqual(['quoted', 'att2']);
  });
});

describe('cancel and cleanup', () => {
  it('aborts the request and revokes the preview when the composer closes', async () => {
    const view = mount();
    fireEvent.click(screen.getByText('Add image'));
    await settle();
    const request = uploads[0];
    const fetchMock = vi.mocked(fetch);
    await request?.options.fetch('/upload', {});
    const signal = fetchMock.mock.calls.at(-1)?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    view.close();
    expect(signal?.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('aborts the request and revokes the preview on unmount', async () => {
    const view = mount();
    fireEvent.click(screen.getByText('Add image'));
    await settle();
    const request = uploads[0];
    await request?.options.fetch('/upload', {});
    const signal = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('ignores a result that arrives after the composer closed', async () => {
    const view = mount();
    fireEvent.click(screen.getByText('Add image'));
    await settle();
    view.close();
    await act(async () => uploads[0]?.succeed());
    await settle();
    expect(nodes.resolve).not.toHaveBeenCalled();
    // The attachment the server did create is a known id; it is cleaned up.
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(
      'personal',
      'mailbox',
      'draft',
      'att1'
    );
  });
});
