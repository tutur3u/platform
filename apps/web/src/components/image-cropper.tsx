'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Slider } from '@tuturuuu/ui/slider';
import { useCallback, useState } from 'react';
import type { Area, Point } from 'react-easy-crop';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

const isHeicFile = (file: File): boolean => {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  );
};

const convertHeicToJpeg = async (file: File): Promise<File> => {
  try {
    // Use heic-convert/browser for reliable HEIC conversion
    const heicConvert = (await import('heic-convert/browser')).default;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Create timeout to prevent hanging
    const conversionPromise = heicConvert({
      buffer: new Uint8Array(arrayBuffer),
      format: 'JPEG',
      quality: 0.9,
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Conversion timed out after 30 seconds')),
        30000
      );
    });

    // Race between conversion and timeout
    const outputBuffer = (await Promise.race([
      conversionPromise,
      timeoutPromise,
    ])) as ArrayBuffer;

    return new File(
      [outputBuffer],
      file.name.replace(/\.(heic|heif)$/i, '.jpg'),
      {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }
    );
  } catch (error) {
    console.error('HEIC conversion failed:', error);

    // Provide specific error types for proper translation
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        const timeoutError = new Error('HEIC_CONVERSION_TIMEOUT');
        timeoutError.name = 'HEIC_CONVERSION_TIMEOUT';
        throw timeoutError;
      } else if (
        error.message.includes('memory') ||
        error.message.includes('heap')
      ) {
        const memoryError = new Error('HEIC_CONVERSION_MEMORY');
        memoryError.name = 'HEIC_CONVERSION_MEMORY';
        throw memoryError;
      } else if (
        error.message.includes('codec') ||
        error.message.includes('unsupported')
      ) {
        const unsupportedError = new Error('HEIC_CONVERSION_UNSUPPORTED');
        unsupportedError.name = 'HEIC_CONVERSION_UNSUPPORTED';
        throw unsupportedError;
      }
    }

    const conversionError = new Error('HEIC_CONVERSION_FAILED');
    conversionError.name = 'HEIC_CONVERSION_FAILED';
    throw conversionError;
  }
};

interface ImageCropperProps {
  image: string;
  originalFile?: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropComplete: (croppedImage: Blob) => void;
  onCancel?: () => void;
  title?: string;
  aspectRatio?: number;
}

export function ImageCropper({
  image,
  originalFile,
  open,
  onOpenChange,
  onCropComplete,
  onCancel,
  title = 'Crop Image',
  aspectRatio = 1, // Square by default for avatars
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [loading, setLoading] = useState(false);

  const onCropCompleteCallback = useCallback(
    (_: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const createCroppedImageFromFile = useCallback(
    async (file: File, pixelCrop: Area): Promise<Blob> => {
      // Convert HEIC/HEIF files to JPEG first
      let imageData: string;

      if (isHeicFile(file)) {
        console.log('Converting HEIC file to JPEG...');
        const convertedFile = await convertHeicToJpeg(file);
        imageData = URL.createObjectURL(convertedFile);
      } else {
        imageData = URL.createObjectURL(file);
      }

      return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Set canvas size to the crop size
          canvas.width = pixelCrop.width;
          canvas.height = pixelCrop.height;

          // Draw the cropped image
          ctx.drawImage(
            img,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            pixelCrop.width,
            pixelCrop.height
          );

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas toBlob failed'));
              }
            },
            'image/jpeg',
            0.8 // 80% quality
          );
        };

        img.onerror = (error) => {
          console.error('Image load error:', error);
          reject(new Error('Failed to load image from imageData'));
        };

        img.src = imageData;
      });
    },
    []
  );

  const createCroppedImageFromUrl = useCallback(
    async (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const img = new Image();

        // Only set crossOrigin for external URLs, not for blob URLs
        if (!imageSrc.startsWith('blob:') && !imageSrc.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
          // Set canvas size to the crop size
          canvas.width = pixelCrop.width;
          canvas.height = pixelCrop.height;

          // Draw the cropped image
          ctx.drawImage(
            img,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            pixelCrop.width,
            pixelCrop.height
          );

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas toBlob failed'));
              }
            },
            'image/jpeg',
            0.8 // 80% quality
          );
        };

        img.onerror = (error) => {
          console.error('Image load error:', error, 'Image src:', imageSrc);
          reject(
            new Error(`Failed to load image: ${imageSrc.substring(0, 50)}...`)
          );
        };

        img.src = imageSrc;
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;

    setLoading(true);
    try {
      let croppedImage: Blob;

      // Prefer using the original file if available for more reliable processing
      if (originalFile) {
        croppedImage = await createCroppedImageFromFile(
          originalFile,
          croppedAreaPixels
        );
      } else {
        croppedImage = await createCroppedImageFromUrl(
          image,
          croppedAreaPixels
        );
      }

      onCropComplete(croppedImage);
      onOpenChange(false);
    } catch (error) {
      console.error('Error cropping image:', error);
      // Let the parent component handle the error display
      // since it has access to the toast notifications
      throw error;
    } finally {
      setLoading(false);
    }
  }, [
    croppedAreaPixels,
    originalFile,
    createCroppedImageFromFile,
    createCroppedImageFromUrl,
    image,
    onCropComplete,
    onOpenChange,
  ]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-dynamic-foreground">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cropper Container */}
          <div className="relative h-[500px] w-full overflow-hidden rounded-lg border bg-dynamic-muted/20">
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onCropComplete={onCropCompleteCallback}
              onZoomChange={setZoom}
              cropShape="rect"
              showGrid={true}
              restrictPosition={true}
              style={{
                containerStyle: {
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'transparent',
                  padding: '0',
                  margin: '0',
                },
                mediaStyle: {
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                },
                cropAreaStyle: {
                  border: '2px solid hsl(var(--primary))',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                },
              }}
            />
          </div>

          {/* Zoom Control */}
          <div className="space-y-2">
            <label
              htmlFor="zoom-slider"
              className="font-medium text-dynamic-foreground text-sm"
            >
              Zoom
            </label>
            <Slider
              id="zoom-slider"
              value={[zoom]}
              onValueChange={(value) => setZoom(value[0] || 1)}
              min={1}
              max={3}
              step={0.1}
              className="w-full"
            />
          </div>

          {/* Instructions */}
          <div className="text-center text-dynamic-muted-foreground text-sm">
            Drag to reposition • Use slider to zoom •{' '}
            {aspectRatio === 1 ? 'Square' : 'Custom'} crop
            {originalFile && isHeicFile(originalFile) && (
              <div className="mt-1 text-blue-600 text-xs">
                📱 HEIC image detected - converting for compatibility
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 max-sm:gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
            className="max-sm:w-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !croppedAreaPixels}
            className="max-sm:w-full"
          >
            {loading ? 'Processing...' : 'Save Crop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
