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
});
