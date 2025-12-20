'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  MessageSquareWarning,
  Upload,
  X,
} from '@tuturuuu/icons';
import type { Product, SupportType } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn, isValidBlobUrl } from '@tuturuuu/utils/format';
import imageCompression from 'browser-image-compression';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';

interface ReportProblemFormData {
  product: Product | '';
  type: SupportType | '';
  suggestion: string;
  media: File[];
}

const MAX_MEDIA_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 10;

// Allowed media types
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

// Zod schema for form validation
const reportProblemSchema = z.object({
  product: z.enum(
    [
      'web',
      'nova',
      'rewise',
      'calendar',
      'finance',
      'tudo',
      'tumeet',
      'shortener',
      'qr',
      'drive',
      'mail',
      'other',
    ],
    {
      message: 'Please select a product',
    }
  ),
  type: z.enum(['bug', 'feature-request'], {
    message: 'Please select a support type',
  }),
  suggestion: z
    .string()
    .trim()
    .min(1, 'Please describe the issue or suggestion')
    .max(1000, 'Suggestion must be at most 1000 characters'),
  media: z
    .array(z.instanceof(File))
    .max(MAX_FILES, `You can upload up to ${MAX_FILES} files`)
    .refine(
      (files) =>
        files.every(
          (f) =>
            ALLOWED_IMAGE_TYPES.includes(f.type) ||
            ALLOWED_VIDEO_TYPES.includes(f.type)
        ),
      {
        message:
          'Only image (PNG, JPEG, WebP, GIF) and video (MP4, WebM, MOV) files are allowed',
      }
    )
    .refine((files) => files.every((f) => f.size <= MAX_MEDIA_SIZE), {
      message: 'Each file must be 5MB or less',
    }),
});

interface ReportProblemDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  products?: Array<{ value: Product; label: string }>;
  className?: string;
  trigger?: React.ReactNode;
  showTrigger?: boolean;
}

const DEFAULT_PRODUCTS: Array<{ value: Product; label: string }> = [
  { value: 'web', label: 'Web Dashboard' },
  { value: 'nova', label: 'Nova' },
  { value: 'rewise', label: 'Rewise' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'finance', label: 'Finance' },
  { value: 'tudo', label: 'Tudo' },
  { value: 'tumeet', label: 'Tumeet' },
  { value: 'shortener', label: 'URL Shortener' },
  { value: 'qr', label: 'QR Code' },
  { value: 'drive', label: 'Drive' },
  { value: 'mail', label: 'Mail' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_SUPPORT_TYPES: Array<{ value: SupportType; label: string }> = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature-request', label: 'Feature Request' },
];

const LOCAL_STORAGE_KEY = 'report-problem-form-data';

export function ReportProblemDialog({
  open,
  onOpenChange,
  products = DEFAULT_PRODUCTS,
  className,
  trigger,
  showTrigger = true,
}: ReportProblemDialogProps) {
  const t = useTranslations('common');
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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

    setIsSubmitting(true);

    try {
      // Default API submission logic
      const apiFormData = new FormData();
      apiFormData.append('product', formData.product);
      apiFormData.append('type', formData.type);
      apiFormData.append('suggestion', formData.suggestion);

      // Generate a subject based on the type and product
      const subject = `${formData.type === 'bug' ? 'Bug Report' : 'Feature Request'} - ${
        DEFAULT_PRODUCTS.find((p) => p.value === formData.product)?.label ||
        formData.product
      }`;
      apiFormData.append('subject', subject);

      // Append media files
      formData.media.forEach((file, index) => {
        apiFormData.append(`media_${index}`, file);
      });

      // Submit to API
      const response = await fetch('/api/reports', {
        method: 'POST',
        body: apiFormData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success(t('report-submitted-success'));
      } else {
        throw new Error(result.message || 'Failed to submit report');
      }

      // Close dialog (which will also trigger cleanup)
      handleOpenChange(false);
    } catch (error) {
      console.error('Failed to submit report:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
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

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="secondary" size="sm" className={cn(className)}>
              <MessageSquareWarning className="mr-2 h-4 w-4" />
              {t('report-problem')}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="mx-auto flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-7xl flex-col overflow-hidden">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            {t('report-problem')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-muted-foreground text-sm">
            {t('report-problem-description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <Label
                htmlFor="product"
                className="flex items-center gap-1 font-medium text-sm"
              >
                {t('affected-product-required')}
              </Label>
              <Select
                value={formData.product}
                onValueChange={handleProductChange}
              >
                <SelectTrigger
                  className={cn(
                    'h-11',
                    validationErrors.product &&
                      'border-red-500 focus:border-red-500'
                  )}
                >
                  <SelectValue placeholder={t('select-product-placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.value} value={product.value}>
                      {product.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.product && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.product}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="type"
                className="flex items-center gap-1 font-medium text-sm"
              >
                Support Type *
              </Label>
              <Select value={formData.type} onValueChange={handleTypeChange}>
                <SelectTrigger
                  className={cn(
                    'h-11',
                    validationErrors.type &&
                      'border-red-500 focus:border-red-500'
                  )}
                >
                  <SelectValue placeholder="Select support type..." />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_SUPPORT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.type && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.type}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="suggestion"
                className="flex items-center gap-1 font-medium text-sm"
              >
                {t('suggestion-improve')}
              </Label>
              <Textarea
                id={suggestionId}
                placeholder={t('suggestion-placeholder')}
                value={formData.suggestion}
                onChange={handleSuggestionChange}
                className={cn(
                  'max-h-[250px] min-h-[120px] resize-y',
                  validationErrors.suggestion &&
                    'border-red-500 focus:border-red-500'
                )}
              />
              {validationErrors.suggestion && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.suggestion}
                </div>
              )}
              <div className="text-muted-foreground text-xs">
                {formData.suggestion.length}/1000 characters
              </div>
            </div>

            <div className="space-y-4">
              <Label className="font-medium text-sm">
                {t('media-optional')} ({formData.media.length}/{MAX_FILES})
              </Label>

              {formData.media.length < MAX_FILES && (
                <button
                  type="button"
                  className={cn(
                    'relative mt-2 w-full rounded-lg border-2 border-dashed transition-all duration-200',
                    isDragOver
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                      : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500',
                    isCompressing && 'pointer-events-none opacity-50'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  aria-label="Click to upload or drag and drop media files"
                  disabled={isCompressing}
                >
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    multiple
                    onChange={handleMediaUpload}
                    disabled={isSubmitting || isCompressing}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    id={mediaUploadId}
                  />
                  <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                    <div
                      className={cn(
                        'mb-3 flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                        isDragOver
                          ? 'bg-orange-100 dark:bg-orange-900'
                          : 'bg-gray-100 dark:bg-gray-800'
                      )}
                    >
                      <Upload
                        className={cn(
                          'h-5 w-5',
                          isDragOver ? 'text-orange-600' : 'text-gray-400'
                        )}
                      />
                    </div>
                    <p className="mb-1 font-medium text-sm">
                      {isCompressing
                        ? 'Compressing...'
                        : isDragOver
                          ? 'Drop files here'
                          : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Images (PNG, JPG, GIF, WebP) or Videos (MP4, WebM, MOV) up
                      to 5MB each
                    </p>
                  </div>
                </button>
              )}

              {validationErrors.media && (
                <div className="text-red-600 text-sm">
                  {validationErrors.media}
                </div>
              )}

              {mediaPreviews.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {mediaPreviews.map((preview, index) => {
                    const file = formData.media[index];
                    const isVideo =
                      file && ALLOWED_VIDEO_TYPES.includes(file.type);

                    return (
                      <div key={preview} className="group relative">
                        <div className="aspect-square overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                          {isVideo ? (
                            <video
                              src={isValidBlobUrl(preview) ? preview : ''}
                              className="h-full w-full object-cover"
                              controls={false}
                              muted
                              playsInline
                            />
                          ) : (
                            <Image
                              src={
                                isValidBlobUrl(preview)
                                  ? preview
                                  : '/placeholder.svg'
                              }
                              alt={t('media-alt', { number: index + 1 })}
                              className="h-full w-full object-cover"
                              width={100}
                              height={100}
                            />
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                          onClick={() => removeMedia(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex w-full flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  !formData.product ||
                  !formData.type ||
                  !formData.suggestion.trim() ||
                  isSubmitting
                }
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 sm:w-auto"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t('submitting')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {t('submit-report')}
                  </div>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
