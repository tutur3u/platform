// @vitest-environment jsdom
/**
 * Real TipTap editor wired to the real upload store (only the network, the
 * object URLs and the decoder are fake). Copying, pasting and reopening images
 * must give every node its own identity while they share one attachment.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import type { MailAttachment } from '@tuturuuu/internal-api';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MailImageNodes } from './mail-composer-image-nodes';
import type { MailMediaOwner } from './mail-composer-upload-state';
import { MailUploadStore } from './mail-composer-upload-store';
import {
  attachment,
  flush,
  OWNER,
} from './mail-composer-upload-store.fixtures';

const observed: { editor: Editor | null } = { editor: null };
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor(...args: Parameters<typeof actual.useEditor>) {
      const editor = actual.useEditor(...args);
      observed.editor = editor;
      return editor;
    },
  };
});
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { MailComposerEditor } from './mail-composer-editor';

const raw = (id: string) =>
  `/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft/attachments/${id}`;
const REMOVE = '[aria-label="media_remove_image"]';

beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
});
afterEach(() => {
  observed.editor?.destroy();
  observed.editor = null;
  cleanup();
});

async function open({
  attachments = [],
  html,
}: {
  attachments?: MailAttachment[];
  html: string;
}) {
  observed.editor = null;
  const bridge: { nodes: MailImageNodes | null } = { nodes: null };
  let counter = 0;
  let uploaded = 0;
  const deps = {
    createObjectUrl: vi.fn(() => 'blob:local'),
    decodeImage: vi.fn(async () => ({ height: 480, width: 640 })),
    draftId: () => OWNER.draftId,
    ensureDraft: vi.fn(async () => OWNER.draftId),
    imageSource: (owner: MailMediaOwner, id: string) =>
      raw(id).replace('/ws/', `/${owner.workspaceId}/`),
    newId: () => `id${++counter}`,
    nodes: () => bridge.nodes,
    onRemoveFailed: vi.fn(),
    remove: vi.fn(async () => {}),
    revokeObjectUrl: vi.fn(),
    scope: () => ({
      mailboxId: OWNER.mailboxId,
      workspaceId: OWNER.workspaceId,
    }),
    upload: vi.fn(async ({ inline }: { inline: boolean }) =>
      attachment(`att${++uploaded}`, inline ? 'inline' : 'attachment')
    ),
  };
  const store = new MailUploadStore(deps);
  store.reset(attachments, OWNER);
  const changed = vi.fn<(value: { html: string; text: string }) => void>();
  const view = render(
    createElement(MailComposerEditor, {
      initialHtml: html,
      onChange: changed,
      onEnhance: vi.fn(),
      onImageNodes: (nodes: MailImageNodes | null) => {
        bridge.nodes = nodes;
      },
      onImageNodesChange: () => store.reconcileNodes(),
      onRemoveImage: (id: string) => store.removeImage(id),
      onRetryImage: (id: string) => store.retry(id),
      onSelectionChange: vi.fn(),
    })
  );
  const editor = await waitFor(() => {
    if (!observed.editor) throw new Error('Editor not ready');
    return observed.editor;
  });
  await waitFor(() => expect(bridge.nodes).not.toBeNull());
  return { ...view, changed, deps, editor, store };
}

function images(editor: Editor) {
  const found: { id: string | null; pos: number; src: string }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image')
      found.push({
        id: (node.attrs.uploadId as string | null) ?? null,
        pos,
        src: String(node.attrs.src),
      });
    return node.type.name !== 'image';
  });
  return found;
}
const ids = (editor: Editor) => images(editor).map((image) => image.id);

const addImage = (view: { store: MailUploadStore }) =>
  act(() =>
    view.store.addFiles([new File(['x'], 'a.png', { type: 'image/png' })], true)
  );
const settle = () => act(async () => void (await flush()));
const select = (editor: Editor, index: number) =>
  act(() => {
    editor.commands.setNodeSelection(images(editor)[index]?.pos ?? 0);
  });
/** Cursor at the end of the last paragraph, so a paste lands after the images. */
const cursorAtEnd = (editor: Editor) =>
  act(() => {
    let last = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') last = pos + node.nodeSize - 1;
    });
    editor.commands.setTextSelection(last);
  });

function clipboard() {
  const data = new Map<string, string>();
  return {
    clearData: () => data.clear(),
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => void data.set(type, value),
  };
}
function fire(
  editor: Editor,
  type: 'copy' | 'paste',
  data: ReturnType<typeof clipboard>
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  act(() => void editor.view.dom.dispatchEvent(event));
}
function copySelection(editor: Editor) {
  const data = clipboard();
  fire(editor, 'copy', data);
  expect(data.getData('text/html')).toContain('<img');
  return data;
}
async function clickRemove(view: { container: HTMLElement }) {
  const button = await waitFor(() => {
    const found = view.container.querySelector<HTMLButtonElement>(REMOVE);
    if (!found) throw new Error('No remove control');
    return found;
  });
  fireEvent.click(button);
}

describe('images reopened from a draft', () => {
  const html = `<p>Hi</p><img src="${raw('image-1')}"><img src="${raw('image-1')}">`;

  it('gives each of two nodes sharing one attachment its own identity', async () => {
    const view = await open({
      attachments: [attachment('image-1', 'inline')],
      html,
    });
    const [first, second] = ids(view.editor);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
    expect(images(view.editor).map((image) => image.src)).toEqual([
      raw('image-1'),
      raw('image-1'),
    ]);
  });

  it('removes the selected later duplicate only, then deletes after the last one', async () => {
    const view = await open({
      attachments: [attachment('image-1', 'inline')],
      html,
    });
    const [first] = ids(view.editor);
    select(view.editor, 1);
    await clickRemove(view);
    await settle();
    expect(ids(view.editor)).toEqual([first]);
    expect(view.deps.remove).not.toHaveBeenCalled();
    expect(view.store.getSnapshot().items.map((item) => item.status)).toEqual([
      'uploaded',
    ]);
    expect(view.changed.mock.calls.at(-1)?.[0].html).toContain(raw('image-1'));

    select(view.editor, 0);
    await clickRemove(view);
    expect(view.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'image-1');
    await settle();
    expect(images(view.editor)).toEqual([]);
    expect(view.store.getSnapshot().items).toEqual([]);
  });

  it('puts the same node back in place when the last delete fails', async () => {
    const view = await open({
      attachments: [attachment('image-1', 'inline')],
      html: `<p>Hi</p><img src="${raw('image-1')}"><p>after</p>`,
    });
    const [only] = images(view.editor);
    let reject: ((error: Error) => void) | undefined;
    view.deps.remove.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        })
    );
    select(view.editor, 0);
    await clickRemove(view);
    // Hidden at once, and never part of a save while hidden.
    expect(view.editor.getHTML()).toContain('data-mail-upload="removing"');
    expect(view.changed.mock.calls.at(-1)?.[0].html).not.toContain('<img');
    await act(async () => reject?.(new Error('offline')));
    await settle();
    const [back] = images(view.editor);
    expect(back?.id).toBe(only?.id);
    expect(back?.pos).toBe(only?.pos);
    expect(view.editor.getHTML()).not.toContain('data-mail-upload');
    expect(view.changed.mock.calls.at(-1)?.[0].html).toContain(raw('image-1'));
    expect(view.store.getSnapshot().items.map((item) => item.status)).toEqual([
      'uploaded',
    ]);
    expect(view.deps.onRemoveFailed).toHaveBeenCalledTimes(1);
  });
});

describe('undo after orphan attachment removal', () => {
  it('fences deleted sources until the composer session resets', async () => {
    const image = attachment('image-1', 'inline');
    const html = `<p>Hi</p><img src="${raw(image.id)}"><p>end</p>`;
    const view = await open({ attachments: [image], html });
    select(view.editor, 0);
    act(() => {
      view.editor.commands.deleteSelection();
    });
    expect(images(view.editor)).toEqual([]);

    act(() => view.store.remove(image.id));
    await settle();
    expect(view.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, image.id);
    expect(view.store.getSnapshot().items).toEqual([]);

    act(() => {
      expect(view.editor.commands.undo()).toBe(true);
    });
    expect(images(view.editor)).toEqual([]);
    expect(view.changed.mock.calls.at(-1)?.[0].html).not.toContain('<img');

    // A newly opened draft owns its own attachment set and undo fence.
    act(() => {
      view.store.reset([image], OWNER);
      view.editor.commands.setContent(html);
    });
    expect(images(view.editor).map((node) => node.src)).toEqual([
      raw(image.id),
    ]);
  });

  it('allows undo to restore an image when the server delete failed', async () => {
    const image = attachment('image-1', 'inline');
    const view = await open({
      attachments: [image],
      html: `<p>Hi</p><img src="${raw(image.id)}"><p>end</p>`,
    });
    view.deps.remove.mockRejectedValueOnce(new Error('offline'));
    select(view.editor, 0);
    act(() => {
      view.editor.commands.deleteSelection();
      view.store.remove(image.id);
    });
    await settle();
    expect(view.deps.onRemoveFailed).toHaveBeenCalledTimes(1);
    act(() => {
      expect(view.editor.commands.undo()).toBe(true);
    });
    expect(images(view.editor).map((node) => node.src)).toEqual([
      raw(image.id),
    ]);
  });
});

describe('copy and paste', () => {
  async function uploadedImage() {
    const view = await open({ html: '<p>Hi</p><p>end</p>' });
    addImage(view);
    await settle();
    expect(view.store.getSnapshot().items.map((item) => item.status)).toEqual([
      'uploaded',
    ]);
    expect(images(view.editor).map((image) => image.src)).toEqual([
      raw('att1'),
    ]);
    return view;
  }

  it('makes a pasted copy of an uploaded image a removable instance', async () => {
    const view = await uploadedImage();
    const [original] = ids(view.editor);
    select(view.editor, 0);
    const data = copySelection(view.editor);
    cursorAtEnd(view.editor);
    fire(view.editor, 'paste', data);
    await settle();

    const after = ids(view.editor);
    expect(after).toHaveLength(2);
    expect(after).toContain(original);
    const copy = after.find((id) => id !== original);
    expect(copy).toBeTruthy();
    expect(new Set(after).size).toBe(2);
    // No second chip: both nodes show one attachment held by one item.
    expect(view.store.getSnapshot().attachments).toHaveLength(1);

    // Removing the pasted copy works (it is not a no-op) and spares the original.
    select(view.editor, after.indexOf(copy as string));
    await clickRemove(view);
    await settle();
    expect(ids(view.editor)).toEqual([original]);
    expect(view.deps.remove).not.toHaveBeenCalled();

    select(view.editor, 0);
    await clickRemove(view);
    await settle();
    expect(view.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
    expect(images(view.editor)).toEqual([]);
    expect(view.store.getSnapshot().items).toEqual([]);
  });

  it('keeps instance ids unique when a node is duplicated with its attributes', async () => {
    const view = await uploadedImage();
    const node = images(view.editor)[0];
    act(() => {
      view.editor.commands.insertContentAt(view.editor.state.doc.content.size, {
        type: 'image',
        attrs: { src: node?.src, uploadId: node?.id },
      });
    });
    await settle();
    const after = ids(view.editor);
    expect(after).toHaveLength(2);
    expect(new Set(after).size).toBe(2);
    expect(after[0]).toBe(node?.id);
  });

  it('drops a pasted copy of a placeholder that can never resolve', async () => {
    const view = await open({ html: '<p>Hi</p><p>end</p>' });
    view.deps.upload.mockImplementation(
      () => new Promise<MailAttachment>(() => {})
    );
    addImage(view);
    await settle();
    const [pending] = ids(view.editor);
    select(view.editor, 0);
    const data = copySelection(view.editor);
    cursorAtEnd(view.editor);
    fire(view.editor, 'paste', data);
    await settle();
    expect(ids(view.editor)).toEqual([pending]);
    expect(view.store.getSnapshot().items.map((item) => item.status)).toEqual([
      'uploading',
    ]);
    expect(view.deps.remove).not.toHaveBeenCalled();
  });
});
