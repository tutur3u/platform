import { describe, expect, it } from 'vitest';
import { __imageExtensionPrivate } from '../image-extension';

describe('ImageExtension clipboard files', () => {
  it('keeps images when screenshot clipboards advertise text and HTML', () => {
    const imageFile = new File(['image'], 'screenshot.png', {
      type: 'image/png',
    });

    const images = __imageExtensionPrivate.getClipboardImageFiles([
      { type: 'text/plain', getAsFile: () => null } as DataTransferItem,
      { type: 'text/html', getAsFile: () => null } as DataTransferItem,
      {
        type: 'image/png',
        getAsFile: () => imageFile,
      } as DataTransferItem,
    ]);

    expect(images).toEqual([imageFile]);
  });

  it('names an unnamed screenshot from its clipboard MIME type', () => {
    const unnamedImage = new File(['image'], '', { type: 'image/png' });

    const [image] = __imageExtensionPrivate.getClipboardImageFiles([
      {
        type: 'image/png',
        getAsFile: () => unnamedImage,
      } as DataTransferItem,
    ]);

    expect(image).toBeInstanceOf(File);
    expect(image?.name).toBe('pasted-image.png');
    expect(image?.type).toBe('image/png');
    expect(image?.size).toBe(unnamedImage.size);
  });

  it('adds an extension to an extensionless clipboard filename', () => {
    const extensionlessImage = new File(['image'], 'Screenshot', {
      type: 'image/jpeg',
    });

    const [image] = __imageExtensionPrivate.getClipboardImageFiles([
      {
        type: 'image/jpeg',
        getAsFile: () => extensionlessImage,
      } as DataTransferItem,
    ]);

    expect(image?.name).toBe('Screenshot.jpg');
    expect(image?.type).toBe('image/jpeg');
  });

  it('restores a missing file MIME type from the clipboard item', () => {
    const imageWithoutType = new File(['image'], '', { type: '' });

    const [image] = __imageExtensionPrivate.getClipboardImageFiles([
      {
        type: 'image/webp',
        getAsFile: () => imageWithoutType,
      } as DataTransferItem,
    ]);

    expect(image?.name).toBe('pasted-image.webp');
    expect(image?.type).toBe('image/webp');
  });

  it('ignores non-image items and null image files without losing valid images', () => {
    const imageFile = new File(['image'], 'capture.png', {
      type: 'image/png',
    });

    const images = __imageExtensionPrivate.getClipboardImageFiles([
      {
        type: 'text/plain',
        getAsFile: () => new File(['text'], 'note.txt'),
      } as DataTransferItem,
      { type: 'image/png', getAsFile: () => null } as DataTransferItem,
      {
        type: 'image/png',
        getAsFile: () => imageFile,
      } as DataTransferItem,
    ]);

    expect(images).toEqual([imageFile]);
  });
});
