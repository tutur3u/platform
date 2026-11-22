import { describe, expect, it } from 'vitest';
import { collectDroppedFiles } from './use-drive-drop-target';

const entryItem = (file: File, isDirectory: boolean) =>
  ({
    kind: 'file',
    getAsFile: () => file,
    webkitGetAsEntry: () => ({ isDirectory }),
  }) as unknown as DataTransferItem;

describe('collectDroppedFiles', () => {
  it('leaves out folders the browser reports as directories', () => {
    const photo = new File(['x'], 'photo.png');
    const folder = new File([], 'Invoices');
    const transfer = {
      files: [photo, folder] as unknown as FileList,
      items: [
        entryItem(photo, false),
        entryItem(folder, true),
      ] as unknown as DataTransferItemList,
    };

    expect(collectDroppedFiles(transfer)).toEqual({
      files: [photo],
      skippedFolders: 1,
    });
  });

  it('keeps every file when entries are unavailable', () => {
    const photo = new File(['x'], 'photo.png');
    expect(
      collectDroppedFiles({
        files: [photo] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
      })
    ).toEqual({ files: [photo], skippedFolders: 0 });
  });
});
