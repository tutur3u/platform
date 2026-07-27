'use client';

import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';

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
  const [uploading, setUploading] = useState(false);

  return (
    <span className="tuturuuu-editor-tool">
      <button
        aria-label={label}
        aria-busy={uploading}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <ImagePlus aria-hidden="true" />
      </button>
      <input
        accept="image/*"
        disabled={uploading}
        hidden
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file || uploading) return;
          setUploading(true);
          try {
            onInsert(await onUpload(file));
          } catch (error) {
            onError?.(error);
          } finally {
            input.value = '';
            setUploading(false);
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
