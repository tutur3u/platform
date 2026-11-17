// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { embeddedMailImages, pasteMailFiles } from './mail-composer-paste';

describe('Mail clipboard media', () => {
  it('captures screenshot items before the editor consumes their paste', () => {
    const file = new File(['image'], 'screenshot.png', { type: 'image/png' });
    const add = vi.fn();
    const event = {
      clipboardData: { files: [], items: [{ kind: 'file', getAsFile: () => file }] },
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    };
    const section = document.createElement('section');
    const editor = document.createElement('div');
    section.append(editor);
    const consumed = vi.fn();
    section.addEventListener('paste', () => pasteMailFiles(event, add), true);
    editor.addEventListener('paste', consumed);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    event.stopPropagation.mockImplementation(() => paste.stopPropagation());
    editor.dispatchEvent(paste);
    expect(add).toHaveBeenCalledWith([file], true);
    expect(consumed).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('queues Finder files as attachments and images inline in a mixed paste', () => {
    const image = new File(['image'], 'photo.png', { type: 'image/png' });
    const pdf = new File(['pdf'], 'document.pdf', { type: 'application/pdf' });
    const add = vi.fn();
    pasteMailFiles({ clipboardData: { files: [image, pdf], items: [] },
      preventDefault: vi.fn(), stopPropagation: vi.fn() }, add);
    expect(add.mock.calls).toEqual([[[image], true], [[pdf], false]]);
  });

  it('extracts rich HTML embedded images for upload and preserves formatted text', () => {
    const result = embeddedMailImages('<p><strong>Hello</strong><img src="data:image/png;base64,aGVsbG8="></p>');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.type).toBe('image/png');
    expect(result.files[0]?.size).toBe(5);
    expect(result.html).toBe('<p><strong>Hello</strong></p>');
  });

  it('leaves remote HTML images to the editor without fetching them', () => {
    const html = '<p><img src="https://example.com/image.png"></p>';
    expect(embeddedMailImages(html)).toEqual({ files: [], html });
  });

  it('rejects unsupported embedded images with a reason', () => {
    expect(() => embeddedMailImages('<img src="data:image/svg+xml;base64,aGVsbG8=">')).toThrow('Unsupported or oversized clipboard image');
  });

  it('does not intercept ordinary rich text paste', () => {
    const preventDefault = vi.fn();
    expect(pasteMailFiles({ clipboardData: { files: [], items: [] }, preventDefault, stopPropagation: vi.fn() }, vi.fn())).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
