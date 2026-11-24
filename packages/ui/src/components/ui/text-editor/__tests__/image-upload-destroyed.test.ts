import type { Plugin } from '@tiptap/pm/state';
import { describe, expect, it, vi } from 'vitest';
import { CustomImage } from '../image-extension';
import { Video } from '../video-extension';

vi.mock('../media-utils', async () => {
  const actual = await vi.importActual('../media-utils');
  return {
    ...actual,
    getImageDimensions: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
    getVideoDimensions: vi.fn().mockResolvedValue({ width: 640, height: 360 }),
  };
});

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../sonner', () => ({
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
  const create = vi.fn(() => ({ nodeSize: 1 }));
  return {
    isDestroyed: false,
    dom: document.createElement('div'),
    dispatch: vi.fn(),
    posAtCoords: vi.fn(() => ({ pos: 1, inside: -1 })),
    state: {
      selection: { from: 1, to: 1 },
      get tr() {
        return transaction();
      },
      schema: { nodes: { imageResize: { create }, video: { create } } },
      doc: {
        descendants: vi.fn(),
        resolve: vi.fn(() => ({ parent: { isTextblock: false } })),
      },
    },
  };
}

function pasteEvent(file: File) {
  return {
    clipboardData: {
      items: [{ type: file.type, getAsFile: () => file }],
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

function dropEvent(file: File) {
  return {
    clientX: 0,
    clientY: 0,
    dataTransfer: { files: [file] },
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

type Upload = (file: File) => Promise<string>;
type DomEvent = 'paste' | 'drop';

const image = new File(['x'], 'photo.png', { type: 'image/png' });
const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

const flows: Array<{
  name: string;
  event: DomEvent;
  file: File;
  plugins: (upload: Upload) => Plugin[];
}> = [
  {
    name: 'image paste',
    event: 'paste',
    file: image,
    plugins: (onImageUpload) =>
      CustomImage({ onImageUpload }).config.addProseMirrorPlugins(),
  },
  {
    name: 'image drop',
    event: 'drop',
    file: image,
    plugins: (onImageUpload) =>
      CustomImage({ onImageUpload }).config.addProseMirrorPlugins(),
  },
  {
    name: 'video paste',
    event: 'paste',
    file: video,
    plugins: (onVideoUpload) =>
      (Video({ onVideoUpload }).config as any).addProseMirrorPlugins(),
  },
  {
    name: 'video drop',
    event: 'drop',
    file: video,
    plugins: (onVideoUpload) =>
      (Video({ onVideoUpload }).config as any).addProseMirrorPlugins(),
  },
];

const cases = flows.flatMap((flow) =>
  (['resolves', 'fails'] as const).map((outcome) => ({ ...flow, outcome }))
);

describe('media uploads into a closed editor', () => {
  it.each(cases)(
    '$name stops dispatching when the upload $outcome after the editor closed',
    async ({ event, file, plugins, outcome }) => {
      let finishUpload!: (url: string) => void;
      let failUpload!: (error: Error) => void;
      const upload = vi.fn(
        () =>
          new Promise<string>((resolve, reject) => {
            finishUpload = resolve;
            failUpload = reject;
          })
      );
      const handler = plugins(upload).find(
        (plugin) => plugin.props?.handleDOMEvents?.[event] !== undefined
      )?.props?.handleDOMEvents?.[event] as
        | ((view: never, event: Event) => boolean)
        | undefined;
      const view = mockView();

      const domEvent = event === 'paste' ? pasteEvent(file) : dropEvent(file);
      expect(handler?.(view as never, domEvent)).toBe(true);

      // The placeholder goes in once the media dimensions are read.
      await vi.waitFor(() => expect(upload).toHaveBeenCalled());
      const dispatchesBeforeClose = view.dispatch.mock.calls.length;
      expect(dispatchesBeforeClose).toBeGreaterThan(0);

      // The panel closes while the upload is still in flight. A failed
      // upload would otherwise dispatch the placeholder removal.
      view.isDestroyed = true;
      if (outcome === 'resolves') finishUpload('https://example.com/media');
      else failUpload(new Error('network'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(view.dispatch).toHaveBeenCalledTimes(dispatchesBeforeClose);
    }
  );
});
