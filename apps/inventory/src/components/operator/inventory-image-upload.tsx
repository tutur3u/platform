'use client';

import { useMutation } from '@tanstack/react-query';
import { FileImage, Link, UploadCloud, X } from '@tuturuuu/icons';
import {
  type InventoryMediaUploadTarget,
  uploadInventoryMedia,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export function InventoryImageUploadField({
  description,
  label,
  onChange,
  target,
  value,
  wsId,
}: {
  description?: string;
  label: string;
  onChange: (value: string) => void;
  target: InventoryMediaUploadTarget;
  value: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const inputId = useId();
  const [uploadPath, setUploadPath] = useState('');
  const [progress, setProgress] = useState(0);
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadInventoryMedia(wsId, file, target, {
        onUploadProgress: (event) => setProgress(event.percent),
      }),
    onError: () => toast.error(t('imageUploadError')),
    onSuccess: (result) => {
      onChange(result.url);
      setUploadPath(result.path);
      setProgress(100);
      toast.success(t('imageUploadSuccess'));
    },
  });

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">{label}</p>
          {description ? (
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              {description}
            </p>
          ) : null}
        </div>
        {value ? (
          <Button
            className="h-8"
            onClick={() => {
              onChange('');
              setUploadPath('');
              setProgress(0);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
            {t('clearImage')}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <div
          className={cn(
            'grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-border bg-background',
            !value && 'border-dashed'
          )}
        >
          {value ? (
            // biome-ignore lint/performance/noImgElement: previews use arbitrary signed workspace media URLs.
            <img
              alt={label}
              className="h-full w-full object-cover"
              src={value}
            />
          ) : (
            <div className="grid place-items-center gap-2 text-muted-foreground text-sm">
              <FileImage className="h-8 w-8" />
              <span>{t('imagePreview')}</span>
            </div>
          )}
        </div>
        <div className="grid content-start gap-3">
          <label className="grid gap-1 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Link className="h-4 w-4" />
              {t('imageUrl')}
            </span>
            <input
              className="h-10 rounded-md border border-input bg-background px-3"
              inputMode="url"
              onChange={(event) => onChange(event.target.value)}
              placeholder="https://..."
              value={value}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              accept={IMAGE_ACCEPT}
              className="sr-only"
              id={inputId}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) upload.mutate(file);
              }}
              type="file"
            />
            <Button asChild disabled={upload.isPending} type="button">
              <label htmlFor={inputId}>
                <UploadCloud className="h-4 w-4" />
                {upload.isPending ? t('uploadingImage') : t('uploadToDrive')}
              </label>
            </Button>
            <span className="text-muted-foreground text-xs">
              {t('imageUploadLimit')}
            </span>
          </div>
          {upload.isPending || progress > 0 ? (
            <div className="grid gap-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              </div>
              {uploadPath ? (
                <p className="truncate text-muted-foreground text-xs">
                  {t('drivePath')}: {uploadPath}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
