import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { insertUploadedMedia } from '../toolbar-media-insert';

function mockEditor({ withNodes = true } = {}) {
  const tr = { insert: vi.fn(() => tr) };
  const create = vi.fn((attrs: Record<string, unknown>) => ({ attrs }));
  const view = {
    isDestroyed: false,
    dom: document.createElement('div'),
    dispatch: vi.fn(),
    state: {
      selection: { from: 3 },
      tr,
      schema: {
        nodes: withNodes ? { imageResize: { create }, video: { create } } : {},
      },
    },
  };
  const editor = { isDestroyed: false, view };
  return { editor, view, tr, create };
}

describe('insertUploadedMedia', () => {
  it('inserts an image at the cursor at 60% of the editor width', () => {
    const { editor, view, tr, create } = mockEditor();
    expect(
      insertUploadedMedia(editor as unknown as Editor, 'image', 'u.png')
    ).toBe('inserted');
    expect(create).toHaveBeenCalledWith({ src: 'u.png', width: 480 });
    expect(tr.insert).toHaveBeenCalledWith(3, expect.anything());
    expect(view.dispatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the editor', 'editor'],
    ['its view', 'view'],
  ] as const)(
    'writes nothing when %s closed during the upload',
    (_label, part) => {
      const mocks = mockEditor();
      mocks[part].isDestroyed = true;
      expect(
        insertUploadedMedia(mocks.editor as unknown as Editor, 'video', 'u.mp4')
      ).toBe('closed');
      expect(mocks.view.dispatch).not.toHaveBeenCalled();
    }
  );

  it('reports a schema without the media node', () => {
    const { editor, view } = mockEditor({ withNodes: false });
    expect(
      insertUploadedMedia(editor as unknown as Editor, 'image', 'u.png')
    ).toBe('missing-node');
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});

describe('tool-bar uploads', () => {
  it('insert media only through insertUploadedMedia', () => {
    const source = readFileSync(resolve(__dirname, '../tool-bar.tsx'), 'utf8');
    expect(source).not.toMatch(/\bview\.dispatch\(/u);
    expect(source.match(/insertUploadedMedia\(/gu)).toHaveLength(4);
  });
});
