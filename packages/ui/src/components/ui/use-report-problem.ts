'use client';

import type { Product, SupportType } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import imageCompression from 'browser-image-compression';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ALLOWED_IMAGE_TYPES,
  LOCAL_STORAGE_KEY,
  MAX_FILES,
  MAX_MEDIA_SIZE,
  type ReportProblemDialogProps,
  type ReportProblemFormData,
  reportProblemSchema,
} from './report-problem-model';
import {
  buildFeedbackSubject,
  useSubmitFeedbackMutation,
} from './feedback-submission';
import { useFeedbackTurnstile } from './use-feedback-turnstile';

export function useReportProblem({
  open,
  onOpenChange,
  t,
  apiOptions,
  onSubmitted,
  closeOnSubmit = true,
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
  const submitFeedbackMutation = useSubmitFeedbackMutation(apiOptions);
  const isSubmitting = submitFeedbackMutation.isPending;
  // The intake answers 503 while submissions (or image attachments) are
  // switched off; the form then explains it instead of failing silently.
  const [unavailable, setUnavailable] = useState<'all' | 'media' | null>(null);
  const turnstile = useFeedbackTurnstile();
  // One key per submission: retries of the same content reuse it so the intake
  // deduplicates them, and any edit starts a new submission.
  const idempotencyKeyRef = useRef<string | null>(null);
  const startNewSubmission = () => {
    idempotencyKeyRef.current = null;
  };

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
    startNewSubmission();
    setFormData((prev) => ({ ...prev, product: value as Product }));
    if (validationErrors.product) {
      setValidationErrors((prev) => ({ ...prev, product: undefined }));
    }
  };

  const handleTypeChange = (value: string) => {
    startNewSubmission();
    setFormData((prev) => ({ ...prev, type: value as SupportType }));
    if (validationErrors.type) {
      setValidationErrors((prev) => ({ ...prev, type: undefined }));
    }
  };

  const handleSuggestionChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    startNewSubmission();
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

    const files = Array.from(event.dataTransfer.files).filter((file) =>
      ALLOWED_IMAGE_TYPES.includes(file.type)
    );

    if (files.length > 0) {
      processMediaFiles(files);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    try {
      const options = {
        maxSizeMB: 1.5,
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

  const processMediaFiles = async (files: File[]) => {
    // First filter by type only
    const validTypeFiles = files.filter((file) =>
      ALLOWED_IMAGE_TYPES.includes(file.type)
    );

    const invalidTypeCount = files.length - validTypeFiles.length;
    if (invalidTypeCount > 0) {
      setValidationErrors((prev) => ({
        ...prev,
        media: `${invalidTypeCount} file(s) rejected: only a PNG, JPEG or WebP image is allowed.`,
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
      startNewSubmission();
      setIsCompressing(true);
      try {
        // Compress first, then check the size
        const processedWithSize = await Promise.all(
          filesToProcess.map(async (file) => {
            const processedFile = await compressImage(file);

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
            media: `${rejectedBySize.length} file(s) rejected (exceeded 2MB even after compression): ${rejectedNames}`,
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
    startNewSubmission();
    if (unavailable === 'media') setUnavailable(null);
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

    if (!validateForm() || !turnstile.token) {
      return;
    }

    try {
      const validatedForm = reportProblemSchema.parse(formData);
      idempotencyKeyRef.current ??= crypto.randomUUID();

      const subject = buildFeedbackSubject(
        validatedForm.product,
        validatedForm.type
      );
      const receipt = await submitFeedbackMutation.mutateAsync({
        subject,
        suggestion: validatedForm.suggestion,
        media: validatedForm.media,
        idempotencyKey: idempotencyKeyRef.current,
        turnstileToken: turnstile.token,
      });
      startNewSubmission();
      toast.success(t('report-submitted-success'));
      onSubmitted?.({
        id: receipt.id,
        title: subject,
        createdAt: receipt.createdAt,
      });

      if (closeOnSubmit) {
        // Close dialog (which will also trigger cleanup)
        handleOpenChange(false);
      } else {
        resetForm();
      }
    } catch (error) {
      if (isServiceUnavailable(error)) {
        setUnavailable(formData.media.length > 0 ? 'media' : 'all');
        return;
      }
      console.error('Failed to submit feedback:', error);
      toast.error(t('feedback-dialog-submit-failed'));
    } finally {
      // Tokens are single use: a retry waits for a fresh challenge.
      turnstile.reset();
    }
  };

  const resetForm = () => {
    // Revoke all object URLs to free memory
    mediaPreviewsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });

    // Clear all form state
    setFormData({ product: '', type: '', suggestion: '', media: [] });
    setMediaPreviews([]);
    mediaPreviewsRef.current = [];
    setValidationErrors({});
    setIsDragOver(false);
    setIsCompressing(false);
    startNewSubmission();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setUnavailable(null);
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
      resetForm();

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
    turnstile,
    unavailable,
  };
}

function isServiceUnavailable(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 503
  );
}
