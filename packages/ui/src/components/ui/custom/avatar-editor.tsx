'use client';

import { Loader2, Settings } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Button, buttonVariants } from '../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog';
import { Label } from '../label';
import { toast } from '../sonner';

const AVATAR_OUTPUT_SIZE = 500;

export interface AvatarEditorCropRequest {
  file: File;
  imageUrl: string;
  onCancel: () => void;
  onCropComplete: (croppedImage: Blob) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export interface AvatarEditorLabels {
  edit: string;
  fileTooLarge: string;
  invalidImage: string;
  processFailed: string;
  remove: string;
  replace: string;
  save: string;
  upload: string;
}

interface AvatarEditorProps {
  allowEdit?: boolean;
  alt: string;
  description: string;
  fallback: ReactNode;
  labels: AvatarEditorLabels;
  maxFileSize?: number;
  onRemove: () => Promise<void>;
  onSave: (file: File) => Promise<string | null>;
  prepareFile?: (blob: Blob) => Promise<File>;
  renderCropper: (request: AvatarEditorCropRequest) => ReactNode;
  src: string | null;
  title: string;
}

type AvatarMutation =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'removing' };

async function compressAvatarFile(blob: Blob): Promise<File> {
  const compressed = await compressAvatar(blob);
  return new File([compressed], 'avatar.jpg', { type: 'image/jpeg' });
}

function compressAvatar(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('Canvas context is null'));
      return;
    }

    const image = new Image();
    image.onload = () => {
      canvas.width = AVATAR_OUTPUT_SIZE;
      canvas.height = AVATAR_OUTPUT_SIZE;
      context.drawImage(image, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
      URL.revokeObjectURL(image.src);
      canvas.toBlob(
        (compressed) => {
          if (compressed) {
            resolve(compressed);
            return;
          }
          reject(new Error('Blob creation failed'));
        },
        'image/jpeg',
        0.8
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error('Failed to load image'));
    };
    image.src = URL.createObjectURL(blob);
  });
}

function AvatarFace({
  alt,
  className,
  fallback,
  src,
}: {
  alt: string;
  className: string;
  fallback: ReactNode;
  src: string | null;
}) {
  return (
    <Avatar className={className}>
      <AvatarImage
        alt={alt}
        className="rounded-full object-cover"
        src={src || undefined}
      />
      <AvatarFallback className="font-semibold">{fallback}</AvatarFallback>
    </Avatar>
  );
}

export function AvatarEditor({
  allowEdit = true,
  alt,
  description,
  fallback,
  labels,
  maxFileSize = 2 * 1024 * 1024,
  onRemove,
  onSave,
  prepareFile = compressAvatarFile,
  renderCropper,
  src,
  title,
}: AvatarEditorProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [cropSelection, setCropSelection] = useState<{
    file: File;
    imageUrl: string;
  } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mutation, setMutation] = useState<AvatarMutation>({ kind: 'idle' });
  const saving = mutation.kind === 'saving';
  const removing = mutation.kind === 'removing';
  const busy = mutation.kind !== 'idle';
  const selectedImageUrl = cropSelection?.imageUrl ?? null;
  const [committedSrc, setCommittedSrc] = useState<string | null>(src);
  const [previewSrc, setPreviewSrc] = useState<string | null>(src);
  const blobUrlRef = useRef<string | null>(null);
  const selectedImageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    selectedImageUrlRef.current = selectedImageUrl;
  }, [selectedImageUrl]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (selectedImageUrlRef.current) {
        URL.revokeObjectURL(selectedImageUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCommittedSrc(src);
    setPreviewSrc(src);
  }, [src]);

  const clearPendingPreview = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPendingFile(null);
  }, []);

  const clearCropSelection = useCallback(() => {
    if (selectedImageUrlRef.current) {
      URL.revokeObjectURL(selectedImageUrlRef.current);
      selectedImageUrlRef.current = null;
    }
    setCropSelection(null);
  }, []);

  const restoreCommittedPreview = useCallback(() => {
    clearPendingPreview();
    clearCropSelection();
    setPreviewSrc(committedSrc);
  }, [clearCropSelection, clearPendingPreview, committedSrc]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(labels.invalidImage);
      return;
    }

    clearCropSelection();
    const imageUrl = URL.createObjectURL(file);
    selectedImageUrlRef.current = imageUrl;
    setCropSelection({ file, imageUrl });
  };

  const handleCropComplete = async (croppedImage: Blob) => {
    try {
      const nextFile = await prepareFile(croppedImage);
      clearPendingPreview();
      const previewUrl = URL.createObjectURL(nextFile);
      blobUrlRef.current = previewUrl;
      setPreviewSrc(previewUrl);
      setPendingFile(nextFile);
      clearCropSelection();
    } catch (error) {
      console.error('Error processing cropped image:', error);
      toast.error(labels.processFailed);
    }
  };

  const saveAvatar = async () => {
    if (!pendingFile || busy) return;
    if (pendingFile.size > maxFileSize) {
      toast.error(labels.fileTooLarge);
      return;
    }

    setMutation({ kind: 'saving' });
    try {
      const nextSrc = await onSave(pendingFile);
      clearPendingPreview();
      setCommittedSrc(nextSrc);
      setPreviewSrc(nextSrc);
      setOpen(false);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setPreviewSrc(committedSrc);
      clearPendingPreview();
    } finally {
      setMutation({ kind: 'idle' });
    }
  };

  const removeAvatar = async () => {
    if (busy) return;

    if (pendingFile) {
      restoreCommittedPreview();
      return;
    }

    if (!committedSrc) return;

    const previousSrc = committedSrc;
    setPreviewSrc(null);
    setMutation({ kind: 'removing' });
    try {
      await onRemove();
      setCommittedSrc(null);
    } catch (error) {
      console.error('Error removing avatar:', error);
      setPreviewSrc(previousSrc);
    } finally {
      setMutation({ kind: 'idle' });
    }
  };

  const face = (className: string) => (
    <AvatarFace
      alt={alt}
      className={className}
      fallback={fallback}
      src={previewSrc}
    />
  );

  return (
    <>
      {cropSelection
        ? renderCropper({
            file: cropSelection.file,
            imageUrl: cropSelection.imageUrl,
            onCancel: clearCropSelection,
            onCropComplete: (croppedImage) => {
              void handleCropComplete(croppedImage);
            },
            onOpenChange: (isOpen) => {
              if (!isOpen) {
                clearCropSelection();
                return;
              }
            },
            open: true,
          })
        : null}
      {allowEdit ? (
        <Dialog
          open={open}
          onOpenChange={(isOpen) => {
            if (busy && !isOpen) return;
            if (!isOpen) restoreCommittedPreview();
            setOpen(isOpen);
          }}
        >
          <div className="flex items-center justify-center">
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={labels.edit}
                className="relative flex w-fit rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {face(
                  'h-16 w-16 overflow-visible border text-xl [&_svg]:h-6 [&_svg]:w-6'
                )}
                <span
                  className={cn(
                    buttonVariants({ size: 'icon' }),
                    'pointer-events-none absolute -right-1 -bottom-1 size-7 rounded-full backdrop-blur-lg'
                  )}
                >
                  <Settings className="h-3.5 w-3.5" />
                </span>
              </button>
            </DialogTrigger>
          </div>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              {face(
                'h-32 w-32 overflow-visible text-3xl [&_svg]:h-12 [&_svg]:w-12'
              )}
            </div>
            <DialogFooter className="flex-wrap max-sm:gap-2">
              <div>
                <Label htmlFor={fileInputId} className="sr-only">
                  {previewSrc ? labels.replace : labels.upload}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {previewSrc ? labels.replace : labels.upload}
                </Button>
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleFileSelect(file);
                    event.target.value = '';
                  }}
                  className="hidden"
                />
              </div>
              {previewSrc ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    void removeAvatar();
                  }}
                  disabled={busy}
                >
                  {removing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    labels.remove
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  void saveAvatar();
                }}
                disabled={saving || removing || !pendingFile}
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  labels.save
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="flex items-center justify-center">
          {face(
            'h-16 w-16 overflow-visible border text-xl [&_svg]:h-6 [&_svg]:w-6'
          )}
        </div>
      )}
    </>
  );
}
