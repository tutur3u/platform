'use client';

import type { ChangeEvent, RefObject } from 'react';

export function EntryDetailUploadInputs({
  coverInputRef,
  mediaInputAccept,
  mediaInputRef,
  onCoverChange,
  onMediaChange,
  onWebglChange,
  webglInputRef,
}: {
  coverInputRef: RefObject<HTMLInputElement | null>;
  mediaInputAccept: string;
  mediaInputRef: RefObject<HTMLInputElement | null>;
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onWebglChange: (event: ChangeEvent<HTMLInputElement>) => void;
  webglInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      <input
        ref={coverInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={onCoverChange}
      />
      <input
        ref={mediaInputRef}
        multiple
        accept={mediaInputAccept}
        className="hidden"
        type="file"
        onChange={onMediaChange}
      />
      <input
        ref={webglInputRef}
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        type="file"
        onChange={onWebglChange}
      />
    </>
  );
}
