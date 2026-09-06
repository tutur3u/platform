'use client';

import type { Product, SupportType } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import imageCompression from 'browser-image-compression';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  DEFAULT_PRODUCTS,
  LOCAL_STORAGE_KEY,
  MAX_FILES,
  MAX_MEDIA_SIZE,
  type ReportProblemDialogProps,
  type ReportProblemFormData,
  reportProblemSchema,
} from './report-problem-model';
import { useSubmitReportMutation } from './report-problem-mutation';
export function useReportProblem({
  open,
  onOpenChange,
  t,
  apiOptions,
}: ReportProblemDialogProps) {
  const suggestionId = useId();
  const mediaUploadId = useId();

  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled or uncontrolled mode
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;

  const [formData, setFormData] = useState<ReportProblemFormData>({
    product: '',
    type: '',
    suggestion: '',
    media: [],
  });
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    product?: string;
    type?: string;
    suggestion?: string;
    media?: string;
  }>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaPreviewsRef = useRef<string[]>([]);
  const submitReportMutation = useSubmitReportMutation(apiOptions);
  const isSubmitting = submitReportMutation.isPending;

  const validateForm = () => {
    const result = reportProblemSchema.safeParse(formData);
    if (result.success) {
      setValidationErrors({});
      return true;
    }

    const fieldErrors: {
      product?: string;
      type?: string;
      suggestion?: string;
      media?: string;
    } = {};
    for (const issue of result.error.issues) {
      if (issue.path[0] === 'product' && !fieldErrors.product) {
        fieldErrors.product = issue.message;
      }
      if (issue.path[0] === 'type' && !fieldErrors.type) {
        fieldErrors.type = issue.message;
      }
      if (issue.path[0] === 'suggestion' && !fieldErrors.suggestion) {
        fieldErrors.suggestion = issue.message;
      }
      if (issue.path[0] === 'media' && !fieldErrors.media) {
        fieldErrors.media = issue.message;
      }
    }
    setValidationErrors(fieldErrors);
    return false;
  };

  const handleProductChange = (value: string) => {
    setFormData((prev) => ({ ...prev, product: value as Product }));
    if (validationErrors.product) {
      setValidationErrors((prev) => ({ ...prev, product: undefined }));
    }
  };

  const handleTypeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, type: value as SupportType }));
    if (validationErrors.type) {
      setValidationErrors((prev) => ({ ...prev, type: undefined }));
    }
  };

  const handleSuggestionChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, suggestion: event.target.value }));
    if (validationErrors.suggestion && event.target.value.trim()) {
      setValidationErrors((prev) => ({ ...prev, suggestion: undefined }));
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOver(true);
  };
  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files).filter(
      (file) =>
        ALLOWED_IMAGE_TYPES.includes(file.type) ||
        ALLOWED_VIDEO_TYPES.includes(file.type)
    );

    if (files.length > 0) {
      processMediaFiles(files);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    try {
      const options = {
        maxSizeMB: 5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.8,
      };
      const compressedBlob = await imageCompression(file, options);

      // Convert Blob back to File with original name and type
      const compressedFile = new File([compressedBlob], file.name, {
        type: compressedBlob.type || file.type,
        lastModified: Date.now(),
      });

      return compressedFile;
    } catch (error) {
      console.error('Image compression failed:', error);
      return file; // Return original if compression fails
    }
  };

  const compressVideo = async (file: File): Promise<File> => {
    try {
      // Create video element to load the file
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      const videoUrl = URL.createObjectURL(file);
      video.src = videoUrl;

      // Wait for video to load metadata
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
      });

      // Calculate target dimensions (max 1280x720 to reduce file size)
      let targetWidth = video.videoWidth;
      let targetHeight = video.videoHeight;
      const maxWidth = 1280;
      const maxHeight = 720;

      if (targetWidth > maxWidth || targetHeight > maxHeight) {
        const aspectRatio = targetWidth / targetHeight;
        if (aspectRatio > maxWidth / maxHeight) {
          targetWidth = maxWidth;
          targetHeight = Math.round(maxWidth / aspectRatio);
        } else {
          targetHeight = maxHeight;
          targetWidth = Math.round(maxHeight * aspectRatio);
        }
      }

      // Create canvas for video processing
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Set up MediaRecorder with compression settings
      const stream = canvas.captureStream(30); // 30 FPS
      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
        ? 'video/webm; codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm; codecs=vp8')
          ? 'video/webm; codecs=vp8'
          : 'video/webm';

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1000000, // 1 Mbps for good quality with compression
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      // Start recording
      mediaRecorder.start();

      // Play video and draw frames to canvas
      video.currentTime = 0;
      await video.play();

      const drawFrame = () => {
        if (video.ended || video.paused) {
          return;
        }
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        requestAnimationFrame(drawFrame);
      };

      drawFrame();

      // Wait for video to finish
      await new Promise((resolve) => {
        video.onended = resolve;
      });

      // Stop recording
      mediaRecorder.stop();

      // Wait for final data
      const compressedBlob = await new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
      });

      // Clean up
      URL.revokeObjectURL(videoUrl);
      video.remove();
      canvas.remove();

      // Convert to File
      const fileExtension = mimeType.includes('webm') ? 'webm' : 'mp4';
      const fileName = file.name.replace(/\.[^/.]+$/, `.${fileExtension}`);
      const compressedFile = new File([compressedBlob], fileName, {
        type: mimeType,
        lastModified: Date.now(),
      });

      // Only return compressed version if it's actually smaller
      return compressedFile.size < file.size ? compressedFile : file;
    } catch (error) {
      console.error('Video compression failed:', error);
      return file; // Return original if compression fails
    }
  };

  const processMediaFiles = async (files: File[]) => {
    // First filter by type only
    const validTypeFiles = files.filter(
      (file) =>
        ALLOWED_IMAGE_TYPES.includes(file.type) ||
        ALLOWED_VIDEO_TYPES.includes(file.type)
    );

    const invalidTypeCount = files.length - validTypeFiles.length;
    if (invalidTypeCount > 0) {
      setValidationErrors((prev) => ({
        ...prev,
        media: `${invalidTypeCount} file(s) rejected: only images (PNG, JPEG, WebP, GIF) and videos (MP4, WebM, MOV) are allowed.`,
      }));
    }

    const currentMediaCount = formData.media.length;
    const availableSlots = MAX_FILES - currentMediaCount;
    const filesToProcess = validTypeFiles.slice(0, availableSlots);
    const overflow = validTypeFiles.length - filesToProcess.length;

    if (overflow > 0) {
      setValidationErrors((prev) => ({
        ...prev,
        media: `You can upload up to ${MAX_FILES} files. ${overflow} file(s) were rejected.`,
      }));
    }

    if (filesToProcess.length > 0) {
      setIsCompressing(true);
      try {
        // Compress images and videos first, then check size
        const processedWithSize = await Promise.all(
          filesToProcess.map(async (file) => {
            let processedFile = file;

            // Compress images before size check
            if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
              processedFile = await compressImage(file);
            }
            // Compress videos before size check
            else if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
              processedFile = await compressVideo(file);
            }

            return {
              file: processedFile,
              isValid: processedFile.size <= MAX_MEDIA_SIZE,
              originalName: file.name,
            };
          })
        );

        // Filter out files that are still too large after compression
        const validFiles = processedWithSize.filter((item) => item.isValid);
        const rejectedBySize = processedWithSize.filter(
          (item) => !item.isValid
        );

        if (rejectedBySize.length > 0) {
          const rejectedNames = rejectedBySize
            .map((item) => item.originalName)
            .join(', ');
          setValidationErrors((prev) => ({
            ...prev,
            media: `${rejectedBySize.length} file(s) rejected (exceeded 5MB even after compression): ${rejectedNames}`,
          }));
        } else if (validationErrors.media && invalidTypeCount === 0) {
          setValidationErrors((prev) => ({ ...prev, media: undefined }));
        }

        if (validFiles.length > 0) {
          const acceptedFiles = validFiles.map((item) => item.file);
          const newMedia = [...formData.media, ...acceptedFiles];
          setFormData((prev) => ({ ...prev, media: newMedia }));

          // Create preview URLs
          const newPreviews = acceptedFiles.map((file) =>
            URL.createObjectURL(file)
          );
          setMediaPreviews((prev) => {
            const updated = [...prev, ...newPreviews];
            mediaPreviewsRef.current = updated;
            return updated;
          });
        }
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleMediaUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    processMediaFiles(files);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeMedia = (index: number) => {
    // Revoke the object URL to free memory
    if (mediaPreviews[index]) {
      URL.revokeObjectURL(mediaPreviews[index]);
    }

    const newMedia = formData.media.filter((_, i) => i !== index);
    const newPreviews = mediaPreviews.filter((_, i) => i !== index);

    setFormData((prev) => ({ ...prev, media: newMedia }));
    setMediaPreviews(newPreviews);
    mediaPreviewsRef.current = newPreviews;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const validatedForm = reportProblemSchema.parse(formData);

      // Generate a subject based on the type and product
      const subject = `${validatedForm.type === 'bug' ? 'Bug Report' : 'Feature Request'} - ${
        DEFAULT_PRODUCTS.find((p) => p.value === validatedForm.product)
          ?.label || validatedForm.product
      }`;

      await submitReportMutation.mutateAsync({
        product: validatedForm.product,
        type: validatedForm.type,
        suggestion: validatedForm.suggestion,
        subject,
        media: validatedForm.media,
      });
      toast.success(t('report-submitted-success'));

      // Close dialog (which will also trigger cleanup)
      handleOpenChange(false);
    } catch (error) {
      console.error('Failed to submit report:', error);
      toast.error('Failed to submit report. Please try again.');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    // Update internal state for uncontrolled mode
    if (!isControlled) {
      setInternalOpen(newOpen);
    }

    // Notify parent if handler exists (controlled mode)
    if (onOpenChange) {
      onOpenChange(newOpen);
    }

    // Clean up and reset everything when dialog closes
    if (!newOpen) {
      // Revoke all object URLs to free memory
      mediaPreviews.forEach((url) => {
        URL.revokeObjectURL(url);
      });

      // Clear all form state
      setFormData({ product: '', type: '', suggestion: '', media: [] });
      setMediaPreviews([]);
      mediaPreviewsRef.current = [];
      setValidationErrors({});
      setIsDragOver(false);
      setIsCompressing(false);

      // Clear localStorage
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      mediaPreviewsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  return {
    dialogOpen,
    handleOpenChange,
    handleSubmit,
    formData,
    setFormData,
    validationErrors,
    isSubmitting,
    isCompressing,
    suggestionId,
    mediaUploadId,
    isDragOver,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleProductChange,
    handleTypeChange,
    handleSuggestionChange,
    handleMediaUpload,
    mediaPreviews,
    removeMedia,
  };
}
