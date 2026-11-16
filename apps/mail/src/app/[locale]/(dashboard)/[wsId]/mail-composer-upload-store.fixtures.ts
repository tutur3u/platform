// Shared test doubles for the upload store specs.
import type { MailAttachment } from '@tuturuuu/internal-api';
import { vi } from 'vitest';
import {
  type MailImageNodes,
  type MailImageNodeState,
  mailImageAttachmentId,
} from './mail-composer-image-nodes';
import type { MailMediaOwner } from './mail-composer-upload-state';
import {
  type MailUploadDeps,
  MailUploadStore,
} from './mail-composer-upload-store';

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export function attachment(id: string, disposition: 'attachment' | 'inline') {
  return {
    contentId: null,
    contentType: 'image/png',
    disposition,
    filename: `${id}.png`,
    id,
    protectedUrl: null,
    sizeBytes: 10,
  } satisfies MailAttachment;
}
export const png = (name: string) =>
  new File(['x'], name, { type: 'image/png' });
export const pdf = (name: string) =>
  new File(['x'], name, { type: 'application/pdf' });

export const OWNER: MailMediaOwner = {
  draftId: 'draft',
  mailboxId: 'box',
  workspaceId: 'ws',
};

/** Editor stand-in: instances by id, each showing at most one attachment. */
export function fakeNodes() {
  const instances = new Map<
    string,
    { attachmentId: string | null; state: MailImageNodeState | null }
  >();
  const calls: string[] = [];
  const nodes: MailImageNodes = {
    insertPending: ({ uploadId, state }) => {
      instances.set(uploadId, { attachmentId: null, state });
      calls.push(`insert:${uploadId}:${state}`);
      return true;
    },
    inspect: (id) => {
      const node = instances.get(id);
      return node ? { attachmentId: node.attachmentId } : null;
    },
    liveIds: () => new Set(instances.keys()),
    references: (attachmentId, except) =>
      [...instances].filter(
        ([id, node]) =>
          node.attachmentId === attachmentId &&
          id !== except &&
          node.state !== 'removing'
      ).length,
    remove: (id) => {
      calls.push(`remove:${id}`);
      return instances.delete(id);
    },
    removeReferences: (attachmentId) => {
      for (const [id, node] of [...instances])
        if (node.attachmentId === attachmentId) {
          calls.push(`remove:${id}`);
          instances.delete(id);
        }
    },
    resolve: (id, src) => {
      calls.push(`resolve:${id}:${src}`);
      const node = instances.get(id);
      if (!node) return false;
      instances.set(id, {
        attachmentId: mailImageAttachmentId(src),
        state: null,
      });
      return true;
    },
    setRemoving: (id, removing) => {
      calls.push(`removing:${id}:${removing}`);
      const node = instances.get(id);
      if (node) node.state = removing ? 'removing' : null;
    },
    setSize: (id, width, height) => {
      calls.push(`size:${id}:${width}x${height}`);
    },
    setState: (id, state: MailImageNodeState) => {
      calls.push(`state:${id}:${state}`);
    },
  };
  /** A settled image node, as from a reopened draft or a paste. */
  const addSettled = (id: string, attachmentId: string | null) =>
    instances.set(id, { attachmentId, state: null });
  return { addSettled, calls, ids: instances, nodes };
}

export interface PendingUpload {
  attachmentId: string;
  fail: (error?: unknown) => void;
  input: Parameters<MailUploadDeps['upload']>[0];
  succeed: () => void;
}

export function setup({
  editor = true,
  honorAbort = true,
}: { editor?: boolean; honorAbort?: boolean } = {}) {
  const fake = fakeNodes();
  const uploads: PendingUpload[] = [];
  const draft = { id: null as string | null };
  const context = { mailboxId: 'box', workspaceId: 'ws' };
  let counter = 0;
  let decode: (() => void) | null = null;
  const holdDecode = { enabled: false };
  const deps = {
    createObjectUrl: vi.fn((file: Blob) => `blob:${(file as File).name}`),
    decodeImage: vi.fn(
      (src: string) =>
        new Promise<{ height: number; width: number } | null>((resolve) => {
          if (src.startsWith('blob:') || !holdDecode.enabled)
            resolve({ height: 480, width: 640 });
          else decode = () => resolve({ height: 480, width: 640 });
        })
    ),
    draftId: () => draft.id,
    ensureDraft: vi.fn(async (): Promise<string | null> => {
      draft.id = 'draft';
      return 'draft';
    }),
    imageSource: (owner: MailMediaOwner, id: string) =>
      `/api/v1/workspaces/${owner.workspaceId}/mail/mailboxes/${owner.mailboxId}/drafts/${owner.draftId}/attachments/${id}`,
    newId: () => `id${++counter}`,
    nodes: () => (editor ? fake.nodes : null),
    onRemoveFailed: vi.fn(),
    remove: vi.fn(async () => {}),
    revokeObjectUrl: vi.fn(),
    scope: () => ({ ...context }),
    upload: vi.fn(
      (input: PendingUpload['input']) =>
        new Promise<MailAttachment>((resolve, reject) => {
          const attachmentId = `att${uploads.length + 1}`;
          if (honorAbort)
            input.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          uploads.push({
            attachmentId,
            fail: (error = new Error('network')) => reject(error),
            input,
            succeed: () =>
              resolve(
                attachment(attachmentId, input.inline ? 'inline' : 'attachment')
              ),
          });
        })
    ),
  } satisfies MailUploadDeps;
  const store = new MailUploadStore(deps);
  const statuses = () => store.getSnapshot().items.map((item) => item.status);
  const find = (id: string) =>
    store.getSnapshot().items.find((item) => item.id === id);
  return {
    context,
    decode: () => decode?.(),
    deps,
    draft,
    fake,
    find,
    holdDecode,
    statuses,
    store,
    uploads,
  };
}
