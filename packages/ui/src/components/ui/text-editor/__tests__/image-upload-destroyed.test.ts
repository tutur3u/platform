import type { Plugin } from '@tiptap/pm/state';
import { describe, expect, it, vi } from 'vitest';
import { CustomImage } from '../image-extension';

vi.mock('../media-utils', async () => {
  const actual = await vi.importActual('../media-utils');
  return {
    ...actual,
    getImageDimensions: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  };
});

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

/** A transaction stub that records the calls the upload flow chains. */
function transaction() {
  const tr = {
    setMeta: vi.fn(() => tr),
    insert: vi.fn(() => tr),
    delete: vi.fn(() => tr),
  };
  return tr;
}

function mockView() {
  const view = {
    isDestroyed: false,
    dom: document.createElement('div'),
    dispatch: vi.fn(),
    state: {
      selection: { from: 1, to: 1 },
      get tr() {
        return transaction();
      },
      schema: {
        nodes: { imageResize: { create: vi.fn(() => ({ nodeSize: 1 })) } },
      },
      doc: { descendants: vi.fn() },
    },
  };
  return view;
}

function pasteEvent(file: File) {
  return {
    clipboardData: {
      items: [{ type: file.type, getAsFile: () => file }],
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

describe('image paste upload', () => {
  it('stops dispatching once the editor is destroyed mid-upload', async () => {
    let finishUpload!: (url: string) => void;
    const onImageUpload = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishUpload = resolve;
        })
    );
    const extension = CustomImage({ onImageUpload });
    const plugins = extension.config.addProseMirrorPlugins();
    const paste = plugins.find(
      (plugin: Plugin) => plugin.props?.handleDOMEvents?.paste !== undefined
    )?.props?.handleDOMEvents?.paste;
    const view = mockView();

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    expect(paste?.(view as never, pasteEvent(file))).toBe(true);

    // The placeholder goes in once the image dimensions are read.
    await vi.waitFor(() => expect(onImageUpload).toHaveBeenCalled());
    const dispatchesBeforeClose = view.dispatch.mock.calls.length;

    // The panel closes while the upload is still in flight.
    view.isDestroyed = true;
    finishUpload('https://example.com/photo.png');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(view.dispatch).toHaveBeenCalledTimes(dispatchesBeforeClose);
  });
});
