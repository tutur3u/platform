'use client';

import { ImagePlus } from 'lucide-react';
import { useRef } from 'react';

export function ImageUploadControl({
  label,
  onError,
  onInsert,
  onUpload,
}: {
  label: string;
  onError?: (error: unknown) => void;
  onInsert: (src: string) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <span className="tuturuuu-editor-tool">
      <button
        aria-label={label}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <ImagePlus aria-hidden="true" />
      </button>
      <input
        accept="image/*"
        hidden
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          try {
            if (file) onInsert(await onUpload(file));
          } catch (error) {
            onError?.(error);
          } finally {
            input.value = '';
          }
        }}
        ref={inputRef}
        type="file"
      />
      <span aria-hidden="true" className="tuturuuu-editor-tooltip">
        {label}
      </span>
    </span>
  );
}
