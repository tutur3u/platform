import { AlertCircle, Upload, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import type { ChangeEvent, DragEvent } from 'react';

interface ImageUploadSectionProps {
  images: File[];
  imagePreviews: string[];
  existingImageUrls?: string[];
  isCompressing: boolean;
  isDragOver: boolean;
  imageError: string | null;
  disabled?: boolean;
  canAddMore: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDragOver: (e: DragEvent<Element>) => void;
  onDragLeave: (e: DragEvent<Element>) => void;
  onDrop: (e: DragEvent<Element>) => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveNew: (index: number) => void;
  onRemoveExisting: (index: number) => void;
  labels: {
    proofOfWork: string;
    compressing: string;
    dropImages: string;
    clickToUpload: string;
    imageFormats: string;
    proofImageAlt: string;
    existing: string;
    new: string;
  };
}

export function ImageUploadSection({
  images,
  imagePreviews,
  existingImageUrls = [],
  isCompressing,
  isDragOver,
  imageError,
  disabled = false,
  canAddMore,
  fileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onRemoveNew,
  onRemoveExisting,
  labels,
}: ImageUploadSectionProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{labels.proofOfWork}</Label>

      {canAddMore && (
        <button
          type="button"
          className={cn(
            'relative w-full rounded-lg border-2 border-dashed p-6 transition-colors',
            isDragOver
              ? 'border-dynamic-blue bg-dynamic-blue/10'
              : 'border-muted-foreground/25 hover:border-dynamic-blue/50'
          )}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload images"
          disabled={disabled || isCompressing}
        >
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={onFileChange}
            disabled={disabled || isCompressing}
            className="sr-only"
          />
          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                'rounded-full p-3',
                isDragOver ? 'bg-dynamic-blue/20' : 'bg-muted'
              )}
            >
              <Upload
                className={cn(
                  'h-6 w-6',
                  isDragOver ? 'text-dynamic-blue' : 'text-muted-foreground'
                )}
              />
            </div>
            <p className="text-center text-sm">
              {isCompressing ? (
                <span className="text-dynamic-blue">{labels.compressing}</span>
              ) : isDragOver ? (
                <span className="text-dynamic-blue">{labels.dropImages}</span>
              ) : (
                <>
                  <span className="font-medium text-dynamic-blue">
                    {labels.clickToUpload}
                  </span>
                  <br />
                  <span className="text-muted-foreground text-xs">
                    {labels.imageFormats}
                  </span>
                </>
              )}
            </p>
          </div>
        </button>
      )}

      {imageError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {imageError}
        </div>
      )}

      {/* All images (existing + new) */}
      {(existingImageUrls.length > 0 || imagePreviews.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Existing images */}
          {existingImageUrls.map((url, index) => (
            <div key={`existing-${index}`} className="relative">
              <div className="relative h-32 overflow-hidden rounded-lg border bg-muted/10">
                <img
                  src={url}
                  alt={`${labels.proofImageAlt} ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <Badge
                  variant="secondary"
                  className="absolute bottom-2 left-2 text-xs"
                >
                  {labels.existing}
                </Badge>
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={() => onRemoveExisting(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {/* New image previews */}
          {imagePreviews.map((preview, index) => (
            <div key={`new-${index}`} className="relative">
              <div className="relative h-32 overflow-hidden rounded-lg border bg-muted/10">
                <Image
                  src={preview}
                  alt={`${labels.proofImageAlt} ${existingImageUrls.length + index + 1}`}
                  className="object-cover"
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  unoptimized
                />
                <Badge
                  variant="default"
                  className="absolute bottom-2 left-2 bg-dynamic-green text-white text-xs"
                >
                  {labels.new}
                </Badge>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={() => onRemoveNew(index)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
