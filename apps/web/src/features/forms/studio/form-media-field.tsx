'use client';

import {
  ChevronDown,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
  ZoomIn,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { FormsImageDialog } from '../forms-image-dialog';
import { useFormMediaUploadMutation } from '../hooks';
import type { FormStudioInput } from '../schema';
import type { getFormToneClasses } from '../theme';

type FormMediaValue = FormStudioInput['theme']['coverImage'];

export function FormMediaField({
  wsId,
  scope,
  value,
  onChange,
  toneClasses,
  label,
  hint,
}: {
  wsId: string;
  scope: 'cover' | 'section' | 'option';
  value: FormMediaValue;
  onChange: (value: FormMediaValue) => void;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  label: string;
  hint: string;
}) {
  const t = useTranslations('forms');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(scope === 'cover');
  const [previewOpen, setPreviewOpen] = useState(false);
  const uploadMutation = useFormMediaUploadMutation({ wsId });
  const hasImage = Boolean(value.url || value.storagePath);
  const isCompactSectionMedia = scope === 'section' || scope === 'option';

  const mediaPreview = (
    <div
      className={cn(
        'overflow-hidden rounded-[1.35rem] border border-dashed bg-background/65',
        hasImage ? 'border-border/60' : 'border-border/50'
      )}
    >
      <div
        className={cn(
          'relative',
          scope === 'option'
            ? 'aspect-video'
            : isCompactSectionMedia
              ? 'aspect-16/5'
              : 'aspect-16/8'
        )}
      >
        {value.url ? (
          <Image
            src={value.url}
            alt={value.alt || label}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-linear-to-br from-background via-background to-muted/40">
            <div className="space-y-2 px-4 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-background/80">
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">
                {t('studio.image_placeholder_title')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('studio.image_placeholder_description')}
              </p>
            </div>
          </div>
        )}
        {uploadMutation.isPending ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : null}
        {hasImage ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
            onClick={() => setPreviewOpen(true)}
          >
            <ZoomIn className="h-4 w-4" />
            <span className="sr-only">{t('studio.view_image_fullscreen')}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );

  const mediaControls = (
    <div className="space-y-3">
      {mediaPreview}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className={toneClasses.secondaryButtonClassName}
          disabled={uploadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {hasImage ? t('studio.replace_image') : t('studio.upload_image')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-dynamic-red/30 bg-dynamic-red/8 text-dynamic-red hover:border-dynamic-red/40 hover:bg-dynamic-red/14"
          disabled={!hasImage || uploadMutation.isPending}
          onClick={() =>
            onChange({
              storagePath: '',
              url: '',
              alt: '',
            })
          }
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('studio.remove_image')}
        </Button>
      </div>

      <div className="space-y-1.5 rounded-[1.35rem] border border-border/60 bg-background/70 p-3.5">
        <Label>{t('studio.image_alt')}</Label>
        <Input
          value={value.alt}
          onChange={(event) =>
            onChange({
              ...value,
              alt: event.target.value,
            })
          }
          placeholder={t('studio.image_alt_placeholder')}
          className={toneClasses.fieldClassName}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {isCompactSectionMedia ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/55">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start px-4 py-3 hover:bg-transparent"
              >
                <div className="flex w-full items-start gap-3 text-left">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="relative mt-0.5 h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70">
                      {value.url ? (
                        <Image
                          src={value.url}
                          alt={value.alt || label}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImagePlus className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label className="cursor-pointer">{label}</Label>
                      <p className="line-clamp-2 text-muted-foreground text-xs">
                        {hint}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      'mt-1 h-4 w-4 shrink-0 transition-transform',
                      open && 'rotate-180'
                    )}
                  />
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden border-border/60 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <div className="space-y-3 px-4 py-4">{mediaControls}</div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ) : (
        <>
          <div className="space-y-1">
            <Label>{label}</Label>
            <p className="text-muted-foreground text-xs">{hint}</p>
          </div>
          {mediaControls}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (!file) {
            return;
          }

          uploadMutation.mutate(
            {
              file,
              scope,
            },
            {
              onSuccess: (result) => {
                onChange({
                  storagePath: result.storagePath,
                  url: result.url,
                  alt: value.alt,
                });
              },
            }
          );

          event.target.value = '';
        }}
      />
      {hasImage && value.url ? (
        <FormsImageDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          src={value.url}
          alt={value.alt || label}
        />
      ) : null}
    </div>
  );
}
