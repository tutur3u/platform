'use client';

import imageCompression from 'browser-image-compression';
import { useCallback, useEffect, useRef, useState } from 'react';

// Constants
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_IMAGES = 5;
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export interface UseImageUploadOptions {
  maxImages?: number;
  maxSizeBytes?: number;
  onError?: (message: string) => void;
}

export interface UseImageUploadReturn {
  images: File[];
  imagePreviews: string[];
  existingImages: string[];
  isCompressing: boolean;
  imageError: string;
  isDragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleDragOver: (event: React.DragEvent) => void;
  handleDragLeave: (event: React.DragEvent) => void;
  handleDrop: (event: React.DragEvent) => void;
  handleImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeImage: (index: number) => void;
  removeExistingImage: (index: number) => void;
  clearImages: () => void;
  setExistingImages: (images: string[]) => void;
  totalImageCount: number;
  canAddMoreImages: boolean;
}

async function compressImage(file: File): Promise<File> {
  try {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      initialQuality: 0.8,
    };
    const compressedBlob = await imageCompression(file, options);

    const compressedFile = new File([compressedBlob], file.name, {
      type: compressedBlob.type || file.type,
      lastModified: Date.now(),
    });

    return compressedFile;
  } catch (error) {
    console.error('Image compression failed:', error);
    return file;
  }
}

export function useImageUpload(
  options: UseImageUploadOptions = {}
): UseImageUploadReturn {
  const { maxImages = MAX_IMAGES, maxSizeBytes = MAX_IMAGE_SIZE } = options;

  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [imageError, setImageError] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(
    null
  ) as React.RefObject<HTMLInputElement>;
  const imagePreviewsRef = useRef<string[]>([]);

  // Total count includes both new and existing images
  const totalImageCount = images.length + existingImages.length;
  const canAddMoreImages = totalImageCount < maxImages;

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  const processImageFiles = useCallback(
    async (files: File[]) => {
      const validTypeFiles = files.filter((file) =>
        ALLOWED_IMAGE_TYPES.includes(file.type)
      );

      const invalidTypeCount = files.length - validTypeFiles.length;
      if (invalidTypeCount > 0) {
        setImageError(
          `${invalidTypeCount} file(s) rejected: only images (PNG, JPEG, WebP, GIF) are allowed.`
        );
      }

      const availableSlots = maxImages - totalImageCount;
      const filesToProcess = validTypeFiles.slice(0, availableSlots);
      const overflow = validTypeFiles.length - filesToProcess.length;

      if (overflow > 0) {
        setImageError(
          `You can upload up to ${maxImages} images. ${overflow} file(s) were rejected.`
        );
      }

      if (filesToProcess.length > 0) {
        setIsCompressing(true);
        try {
          const processedWithSize = await Promise.all(
            filesToProcess.map(async (file) => {
              const processedFile = await compressImage(file);
              return {
                file: processedFile,
                isValid: processedFile.size <= maxSizeBytes,
                originalName: file.name,
              };
            })
          );

          const validFiles = processedWithSize.filter((item) => item.isValid);
          const rejectedBySize = processedWithSize.filter(
            (item) => !item.isValid
          );

          if (rejectedBySize.length > 0) {
            const rejectedNames = rejectedBySize
              .map((item) => item.originalName)
              .join(', ');
            setImageError(
              `${rejectedBySize.length} file(s) rejected (exceeded 1MB even after compression): ${rejectedNames}`
            );
          } else if (imageError && invalidTypeCount === 0) {
            setImageError('');
          }

          if (validFiles.length > 0) {
            const acceptedFiles = validFiles.map((item) => item.file);
            const newImages = [...images, ...acceptedFiles];
            setImages(newImages);

            const newPreviews = acceptedFiles.map((file) =>
              URL.createObjectURL(file)
            );
            setImagePreviews((prev) => {
              const updated = [...prev, ...newPreviews];
              imagePreviewsRef.current = updated;
              return updated;
            });
          }
        } finally {
          setIsCompressing(false);
        }
      }
    },
    [images, totalImageCount, maxImages, maxSizeBytes, imageError]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);

      const files = Array.from(event.dataTransfer.files).filter((file) =>
        ALLOWED_IMAGE_TYPES.includes(file.type)
      );

      if (files.length > 0) {
        processImageFiles(files);
      }
    },
    [processImageFiles]
  );

  const handleImageUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      processImageFiles(files);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processImageFiles]
  );

  const removeImage = useCallback(
    (index: number) => {
      if (imagePreviews[index]) {
        URL.revokeObjectURL(imagePreviews[index]);
      }

      const newImages = images.filter((_, i) => i !== index);
      const newPreviews = imagePreviews.filter((_, i) => i !== index);

      setImages(newImages);
      setImagePreviews(newPreviews);
      imagePreviewsRef.current = newPreviews;
    },
    [images, imagePreviews]
  );

  const removeExistingImage = useCallback(
    (index: number) => {
      const newExisting = existingImages.filter((_, i) => i !== index);
      setExistingImages(newExisting);
    },
    [existingImages]
  );

  const clearImages = useCallback(() => {
    imagePreviews.forEach((url) => {
      URL.revokeObjectURL(url);
    });

    setImages([]);
    setImagePreviews([]);
    setExistingImages([]);
    imagePreviewsRef.current = [];
    setImageError('');
    setIsDragOver(false);
  }, [imagePreviews]);

  return {
    images,
    imagePreviews,
    existingImages,
    isCompressing,
    imageError,
    isDragOver,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleImageUpload,
    removeImage,
    removeExistingImage,
    clearImages,
    setExistingImages,
    totalImageCount,
    canAddMoreImages,
  };
}

// Shared Image Upload UI Component
