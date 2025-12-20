'use client';

import { Image as ImageIcon, Upload, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useRef, useState } from 'react';

interface ImageSettings {
  src: string;
  originalSrc: string; // Store original image for re-processing
  width: number;
  height: number;
  excavate: boolean;
  opacity?: number;
  rounded?: boolean;
}

interface QRImageUploadProps {
  imageSettings: ImageSettings | null;
  setImageSettings: (settings: ImageSettings | null) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml',
];
const MIN_DIMENSION = 32;
const MAX_DIMENSION = 512;
const RECOMMENDED_SIZE = 64; // Recommended size for QR code center

function QRImageUpload({
  imageSettings,
  setImageSettings,
}: QRImageUploadProps) {
  const t = useTranslations();
  const roundedToggleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return t('qr.image_upload.invalid_type');
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
        return t('qr.image_upload.file_too_large', { size: `${maxSizeMB}MB` });
      }

      return null;
    },
    [t]
  );

  const validateImageDimensions = useCallback(
    (img: HTMLImageElement): string | null => {
      const { width, height } = img;

      // Check minimum dimensions
      if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
        return t('qr.image_upload.dimensions_too_small');
      }

      // Check maximum dimensions
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        return t('qr.image_upload.dimensions_too_large');
      }

      return null;
    },
    [t]
  );

  const createRoundedImage = useCallback(
    (img: HTMLImageElement, isRounded: boolean): string => {
      if (!isRounded) {
        return img.src;
      }

      // Create a canvas to draw the rounded image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return img.src;

      // Set canvas size to match the image
      canvas.width = img.width;
      canvas.height = img.height;

      // Calculate border radius (about 15% of the smaller dimension)
      const borderRadius = Math.min(img.width, img.height) * 0.15;

      // Create a rounded rectangle clipping path
      ctx.beginPath();

      // Check if roundRect is available, otherwise use manual path
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, 0, img.width, img.height, borderRadius);
      } else {
        // Manual rounded rectangle path for older browsers
        ctx.moveTo(borderRadius, 0);
        ctx.lineTo(img.width - borderRadius, 0);
        ctx.quadraticCurveTo(img.width, 0, img.width, borderRadius);
        ctx.lineTo(img.width, img.height - borderRadius);
        ctx.quadraticCurveTo(
          img.width,
          img.height,
          img.width - borderRadius,
          img.height
        );
        ctx.lineTo(borderRadius, img.height);
        ctx.quadraticCurveTo(0, img.height, 0, img.height - borderRadius);
        ctx.lineTo(0, borderRadius);
        ctx.quadraticCurveTo(0, 0, borderRadius, 0);
        ctx.closePath();
      }

      ctx.clip();

      // Draw the image
      ctx.drawImage(img, 0, 0);

      // Return the rounded image as data URL
      return canvas.toDataURL('image/png');
    },
    []
  );

  const processImage = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);

      try {
        // Validate file
        const fileError = validateFile(file);
        if (fileError) {
          setError(fileError);
          setIsLoading(false);
          return;
        }

        // Create image URL
        const imageUrl = URL.createObjectURL(file);

        // Load image to get dimensions using Promise
        const img = document.createElement('img');

        const loadImage = new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = imageUrl;
        });

        try {
          const loadedImg = await loadImage;

          // Validate dimensions
          const dimensionError = validateImageDimensions(loadedImg);
          if (dimensionError) {
            setError(dimensionError);
            URL.revokeObjectURL(imageUrl);
            setIsLoading(false);
            return;
          }

          // Calculate optimal size for QR code
          const maxSize = Math.min(
            loadedImg.width,
            loadedImg.height,
            RECOMMENDED_SIZE
          );
          const aspectRatio = loadedImg.width / loadedImg.height;

          let width = maxSize;
          let height = maxSize;

          if (aspectRatio > 1) {
            height = Math.round(maxSize / aspectRatio);
          } else if (aspectRatio < 1) {
            width = Math.round(maxSize * aspectRatio);
          }

          setImageSettings({
            src: imageUrl,
            originalSrc: imageUrl,
            width,
            height,
            excavate: true,
            opacity: 1,
            rounded: false,
          });

          setIsLoading(false);
        } catch (imageLoadError) {
          console.error('Image loading error:', imageLoadError);
          setError(t('qr.image_upload.invalid_image'));
          URL.revokeObjectURL(imageUrl);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Image processing error:', error);
        setError(t('qr.image_upload.upload_failed'));
        setIsLoading(false);
      }
    },
    [validateFile, validateImageDimensions, setImageSettings, t]
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      processImage(file);
    },
    [processImage]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (imageSettings?.src) {
      URL.revokeObjectURL(imageSettings.src);
    }
    if (
      imageSettings?.originalSrc &&
      imageSettings.originalSrc !== imageSettings.src
    ) {
      URL.revokeObjectURL(imageSettings.originalSrc);
    }
    setImageSettings(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [imageSettings, setImageSettings]);

  const handleToggleRounded = useCallback(async () => {
    if (imageSettings) {
      const newRounded = !imageSettings.rounded;

      // Load the original image to process it
      const img = document.createElement('img');

      const loadImage = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageSettings.originalSrc;
      });

      try {
        const loadedImg = await loadImage;
        const processedSrc = createRoundedImage(loadedImg, newRounded);

        setImageSettings({
          ...imageSettings,
          src: processedSrc,
          rounded: newRounded,
        });
      } catch (error) {
        console.error('Error processing rounded image:', error);
        // Fallback to just toggling the rounded state without processing
        setImageSettings({
          ...imageSettings,
          rounded: newRounded,
        });
      }
    }
  }, [imageSettings, setImageSettings, createRoundedImage]);

  const handleBrowseFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <Label className="font-semibold">{t('qr.image_upload.title')}</Label>
        {imageSettings && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemoveImage}
            className="h-8 px-2"
          >
            <X className="mr-1 h-3 w-3" />
            {t('common.remove')}
          </Button>
        )}
      </div>

      {!imageSettings ? (
        <button
          type="button"
          className={cn(
            'w-full rounded-lg border-2 border-dashed p-6 text-center transition-colors',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25',
            isLoading && 'pointer-events-none opacity-50'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleBrowseFiles}
          disabled={isLoading}
        >
          <div className="flex flex-col items-center space-y-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              <span className="font-medium">
                {t('qr.image_upload.drop_files')}
              </span>
              <span className="text-muted-foreground"> {t('common.or')} </span>
              <span className="text-primary hover:underline">
                {t('qr.image_upload.browse')}
              </span>
            </div>
            <div className="space-y-1 text-muted-foreground text-xs">
              <div>
                {t('qr.image_upload.supported_formats')}: JPG, PNG, WebP, SVG
              </div>
              <div>{t('qr.image_upload.max_size')}: 5MB</div>
              <div>
                {t('qr.image_upload.dimensions')}: {MIN_DIMENSION}x
                {MIN_DIMENSION} - {MAX_DIMENSION}x{MAX_DIMENSION}px
              </div>
              <div>
                {t('qr.image_upload.recommended')}: {RECOMMENDED_SIZE}x
                {RECOMMENDED_SIZE}px
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div className="rounded-lg border p-4">
          <div className="flex items-center space-x-3">
            <div className="shrink-0">
              <Image
                src={imageSettings.src}
                alt="Upload preview"
                width={48}
                height={48}
                className={cn(
                  'border object-contain',
                  imageSettings.rounded ? 'rounded-xl' : 'rounded'
                )}
              />
            </div>
            <div className="min-w-0 grow">
              <div className="flex items-center space-x-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span className="truncate font-medium text-sm">
                  {t('qr.image_upload.image_uploaded')}
                </span>
              </div>
              <div className="mt-1 text-muted-foreground text-xs">
                {imageSettings.width}x{imageSettings.height}px
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <Label htmlFor={roundedToggleId} className="text-sm">
              {t('qr.image_upload.rounded_logo')}
            </Label>
            <Switch
              id={roundedToggleId}
              checked={imageSettings.rounded || false}
              onCheckedChange={handleToggleRounded}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-destructive/20 bg-destructive/10 p-2 text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="text-muted-foreground text-sm">
          {t('qr.image_upload.processing')}...
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
}

export default QRImageUpload;
