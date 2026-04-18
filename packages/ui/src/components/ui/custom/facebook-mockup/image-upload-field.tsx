'use client';

import { Image as ImageIcon, Upload, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';

interface FacebookMockupImageUploadFieldProps {
  label: string;
  helperText: string;
  imageUrl: string | null;
  fileName: string | null;
  previewAlt: string;
  onFileChange: (file: File | null) => void;
}

export function FacebookMockupImageUploadField({
  label,
  helperText,
  imageUrl,
  fileName,
  previewAlt,
  onFileChange,
}: FacebookMockupImageUploadFieldProps) {
  const t = useTranslations();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId}>{label}</Label>
        {fileName ? (
          <span className="truncate text-muted-foreground text-xs">
            {fileName}
          </span>
        ) : null}
      </div>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(event) => {
          onFileChange(event.target.files?.[0] ?? null);
          event.currentTarget.value = '';
        }}
      />

      <button
        type="button"
        className={cn(
          'flex min-h-36 w-full items-center justify-center rounded-2xl border border-dynamic-blue/25 border-dashed bg-linear-to-br from-dynamic-blue/8 via-background to-dynamic-cyan/10 p-3 transition-colors hover:border-dynamic-blue/40 hover:bg-dynamic-blue/8',
          imageUrl && 'border-border border-solid bg-background'
        )}
        onClick={() => inputRef.current?.click()}
      >
        {imageUrl ? (
          <div className="w-full overflow-hidden rounded-xl border border-border bg-background">
            {/* biome-ignore lint/performance/noImgElement: object URLs are rendered directly in the preview tool */}
            <img
              src={imageUrl}
              alt={previewAlt}
              className="h-36 w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 p-3 text-dynamic-blue">
              <ImageIcon className="size-5" />
            </div>
            <div className="font-medium text-sm">{label}</div>
            <div className="max-w-56 text-muted-foreground text-xs">
              {helperText}
            </div>
          </div>
        )}
      </button>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {imageUrl
            ? t('facebook_mockup.actions.replace')
            : t('facebook_mockup.actions.upload')}
        </Button>
        {imageUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onFileChange(null)}
          >
            <X className="size-4" />
            {t('facebook_mockup.actions.remove')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
