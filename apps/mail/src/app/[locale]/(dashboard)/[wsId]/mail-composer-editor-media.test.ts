// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MailImageNodes } from './mail-composer-image-nodes';

const observed: { editors: Set<Editor>; editor: Editor | null } = {
  editor: null,
  editors: new Set(),
};
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor(...args: Parameters<typeof actual.useEditor>) {
      const editor = actual.useEditor(...args);
      observed.editor = editor;
      if (editor) observed.editors.add(editor);
      return editor;
    },
  };
});
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { MailComposerEditor } from './mail-composer-editor';

const raw =
  '/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft/attachments/image-1';

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
  observed.editors.clear();
  cleanup();
});

async function open(html = '<p>Hello</p>') {
  observed.editor = null;
  const changed = vi.fn<(value: { html: string; text: string }) => void>();
  const retry = vi.fn();
  const remove = vi.fn();
  const bridge: { nodes: MailImageNodes | null } = { nodes: null };
  const props = {
    initialHtml: html,
    onChange: changed,
    onEnhance: vi.fn(),
    onImageNodes: (nodes: MailImageNodes | null) => {
      bridge.nodes = nodes;
    },
    onRemoveImage: remove,
    onRetryImage: retry,
    onSelectionChange: vi.fn(),
  };
  const view = render(createElement(MailComposerEditor, props));
  const editor = await waitFor(() => {
    if (!observed.editor) throw new Error('Editor not ready');
    return observed.editor;
  });
  await waitFor(() => expect(bridge.nodes).not.toBeNull());
  const nodes = () => {
    if (!bridge.nodes) throw new Error('No image nodes');
    return bridge.nodes;
  };
  return { ...view, changed, editor, nodes, props, remove, retry };
}
const image = (container: HTMLElement) =>
  container.querySelector<HTMLImageElement>('.tiptap img');
const lastHtml = (changed: { mock: { calls: unknown[][] } }) =>
  (changed.mock.calls.at(-1)?.[0] as { html: string } | undefined)?.html ?? '';

describe('image placeholders', () => {
  it('renders a placeholder at once and never serializes it into the draft', async () => {
    const view = await open();
    act(() => {
      view.nodes().insertPending({
        name: 'photo.png',
        src: 'blob:local-1',
        state: 'uploading',
        uploadId: 'u1',
      });
    });
    expect(image(view.container)?.getAttribute('src')).toBe('blob:local-1');
    expect(
      view.container.querySelector('[data-upload-state="uploading"]')
    ).not.toBeNull();
    // The editor's own HTML carries the marker; the emitted body never does.
    expect(view.editor.getHTML()).toContain('data-mail-upload="uploading"');
    act(() => view.editor.commands.insertContentAt(1, 'typed'));
    const emitted = lastHtml(view.changed);
    expect(emitted).toContain('typed');
    expect(emitted).not.toContain('<img');
    expect(emitted).not.toContain('blob:');
    expect(emitted).not.toContain('data-mail-upload');
  });

  it('keeps one editor identity and emits nothing for status-only changes', async () => {
    const view = await open();
    act(() => {
      view.nodes().insertPending({
        name: 'photo.png',
        src: 'blob:local-1',
        state: 'queued',
        uploadId: 'u1',
      });
    });
    const before = view.changed.mock.calls.length;
    const element = image(view.container);
    act(() => view.nodes().setState('u1', 'uploading'));
    act(() => view.nodes().setState('u1', 'failed'));
    act(() => view.nodes().setSize('u1', 640, 480));
    // Not dirty: no body change, no selection reset, same <img> element.
    expect(view.changed.mock.calls.length).toBe(before);
    expect(image(view.container)).toBe(element);
    expect(observed.editors.size).toBe(1);
    expect(view.editor.isDestroyed).toBe(false);
    expect(
      view.container.querySelector('[data-upload-state="failed"]')
    ).not.toBeNull();
  });

  it('reserves the decoded size so the swap changes no geometry', async () => {
    const view = await open();
    act(() => {
      view.nodes().insertPending({
        name: 'photo.png',
        src: 'blob:local-1',
        state: 'uploading',
        uploadId: 'u1',
      });
    });
    act(() => view.nodes().setSize('u1', 640, 480));
    const wrapper = view.container.querySelector<HTMLElement>(
      '[data-upload-state]'
    );
    expect(wrapper?.style.aspectRatio.replaceAll(' ', '')).toBe('640/480');
    act(() => {
      view.nodes().resolve('u1', raw);
    });
    const settled = view.container.querySelector<HTMLElement>('.tiptap span');
    expect(view.container.querySelector('[data-upload-state]')).toBeNull();
    expect(settled?.style.aspectRatio.replaceAll(' ', '')).toBe('640/480');
    // The wrapper element itself survives the swap: nothing is re-created.
    expect(settled).toBe(wrapper);
  });

  it('replaces the same node in place and keeps its position after typing', async () => {
    const view = await open('<p>Before</p><p>After</p>');
    act(() => view.editor.commands.setTextSelection(7));
    act(() => {
      view.nodes().insertPending({
        name: 'photo.png',
        src: 'blob:local-1',
        state: 'uploading',
        uploadId: 'u1',
      });
    });
    const element = image(view.container);
    // The user keeps typing at the start while the upload is in flight.
    act(() => view.editor.commands.insertContentAt(1, 'Typed '));
    act(() => {
      view.nodes().resolve('u1', raw);
    });
    expect(image(view.container)).toBe(element);
    expect(image(view.container)?.getAttribute('src')).toBe(raw);
    const html = lastHtml(view.changed);
    expect(html.indexOf('Typed Before')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('<img')).toBeGreaterThan(html.indexOf('Before'));
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('After'));
    expect(html).toContain(`src="${raw}"`);
    expect(html).not.toContain('blob:');
    expect(html).not.toContain('data-mail-upload');
  });

  it('hides a removing image from the draft and restores it by id', async () => {
    const view = await open(`<p>Hi</p><img src="${raw}">`);
    act(() => view.editor.commands.insertContentAt(1, 'x'));
    expect(lastHtml(view.changed)).toContain(`src="${raw}"`);
    const [id] = [...view.nodes().liveIds()];
    expect(id).toBeTruthy();
    expect(view.nodes().inspect(id as string)).toEqual({
      attachmentId: 'image-1',
    });
    act(() => view.nodes().setRemoving(id as string, true));
    expect(lastHtml(view.changed)).not.toContain('<img');
    act(() => view.nodes().setRemoving(id as string, false));
    expect(lastHtml(view.changed)).toContain(`src="${raw}"`);
    act(() => {
      view.nodes().remove(id as string);
    });
    expect(view.editor.getHTML()).not.toContain('<img');
    expect(view.nodes().liveIds().size).toBe(0);
  });

  it('routes failed-image Retry and Remove through the node ids', async () => {
    const view = await open();
    act(() => {
      view.nodes().insertPending({
        name: 'photo.png',
        src: 'blob:local-1',
        state: 'failed',
        uploadId: 'u1',
      });
    });
    const retry = view.container.querySelector<HTMLButtonElement>(
      '[data-mail-upload-retry]'
    );
    const remove = view.container.querySelector<HTMLButtonElement>(
      '[data-mail-upload-remove]'
    );
    expect(retry?.getAttribute('aria-label')).toBe('media_action_named');
    act(() => retry?.click());
    act(() => remove?.click());
    expect(view.retry).toHaveBeenCalledWith('u1');
    expect(view.remove).toHaveBeenCalledWith('u1');
  });

  it('shows the remove control only for settled images', async () => {
    const view = await open(`<p>Hi</p><img src="${raw}">`);
    act(() => {
      view.nodes().insertPending({
        name: 'photo.png',
        src: 'blob:local-1',
        state: 'uploading',
        uploadId: 'u1',
      });
    });
    const select = (id: string) =>
      act(() => {
        view.editor.state.doc.descendants((node, position) => {
          if (
            node.type.name === 'image' &&
            (id === 'u1' ? node.attrs.uploadId === id : node.attrs.src === raw)
          ) {
            view.editor.commands.setNodeSelection(position);
            return false;
          }
        });
      });
    select('u1');
    expect(
      view.container.querySelector('[aria-label="media_remove_image"]')
    ).toBeNull();
    select('image-1');
    await waitFor(() =>
      expect(
        view.container.querySelector('[aria-label="media_remove_image"]')
      ).not.toBeNull()
    );
  });

  it('does not re-render for identical props', async () => {
    const view = await open();
    const editor = view.editor;
    view.rerender(createElement(MailComposerEditor, view.props));
    expect(observed.editor).toBe(editor);
    expect(observed.editors.size).toBe(1);
  });
});
