'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  MessageSquareWarning,
  Upload,
  X,
} from '@tuturuuu/icons';
import type { Product, SupportType } from '@tuturuuu/types/db';
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
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';

interface ReportProblemFormData {
  product: Product | '';
  type: SupportType | '';
  suggestion: string;
  images: File[];
}

const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB

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
  images: z
    .array(z.instanceof(File))
    .max(5, 'You can upload up to 5 images')
    .refine((files) => files.every((f) => f.type.startsWith('image/')), {
      message: 'Only image files are allowed',
    })
    .refine((files) => files.every((f) => f.size <= MAX_IMAGE_SIZE), {
      message: 'Each image must be 1MB or less',
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
  const imageUploadId = useId();
  const [formData, setFormData] = useState<ReportProblemFormData>({
    product: '',
    type: '',
    suggestion: '',
    images: [],
  });
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    product?: string;
    type?: string;
    suggestion?: string;
    images?: string;
  }>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewsRef = useRef<string[]>([]);

  // Load form data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setFormData({
          product: parsed.product || '',
          type: parsed.type || '',
          suggestion: parsed.suggestion || '',
          images: [], // Don't restore files from localStorage
        });
      } catch (error) {
        console.error('Failed to parse saved form data:', error);
      }
    }
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    const dataToSave = {
      product: formData.product,
      type: formData.type,
      suggestion: formData.suggestion,
      // Don't save files to localStorage
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
  }, [formData.product, formData.type, formData.suggestion]);

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
      images?: string;
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
      if (issue.path[0] === 'images' && !fieldErrors.images) {
        fieldErrors.images = issue.message;
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

    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      processImageFiles(files);
    }
  };

  const processImageFiles = (files: File[]) => {
    // Filter invalid files by type/size
    const validFiles = files.filter(
      (file) => file.type.startsWith('image/') && file.size <= MAX_IMAGE_SIZE
    );
    const rejectedCount = files.length - validFiles.length;
    if (rejectedCount > 0) {
      setValidationErrors((prev) => ({
        ...prev,
        images: 'Some files were rejected (only images up to 1MB).',
      }));
    } else if (validationErrors.images) {
      setValidationErrors((prev) => ({ ...prev, images: undefined }));
    }

    const maxImages = 5;
    const currentImageCount = formData.images.length;
    const availableSlots = maxImages - currentImageCount;
    const filesToAdd = validFiles.slice(0, availableSlots);
    const overflow = validFiles.length - filesToAdd.length;

    if (overflow > 0) {
      setValidationErrors((prev) => ({
        ...prev,
        images: `You can upload up to ${maxImages} images. ${overflow} images were rejected.`,
      }));
    }

    if (filesToAdd.length > 0) {
      const newImages = [...formData.images, ...filesToAdd];
      setFormData((prev) => ({ ...prev, images: newImages }));

      // Create preview URLs
      const newPreviews = filesToAdd.map((file) => URL.createObjectURL(file));
      setImagePreviews((prev) => {
        const updated = [...prev, ...newPreviews];
        imagePreviewsRef.current = updated;
        return updated;
      });
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    processImageFiles(files);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    // Revoke the object URL to free memory
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index]);
    }

    const newImages = formData.images.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);

    setFormData((prev) => ({ ...prev, images: newImages }));
    setImagePreviews(newPreviews);
    imagePreviewsRef.current = newPreviews;
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

      // Append images
      formData.images.forEach((image, index) => {
        apiFormData.append(`image_${index}`, image);
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

      // Clear form data after successful submission
      setFormData({ product: '', type: '', suggestion: '', images: [] });
      setImagePreviews([]);
      imagePreviewsRef.current = [];
      setValidationErrors({});
      localStorage.removeItem(LOCAL_STORAGE_KEY);

      // Close dialog
      if (onOpenChange) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Failed to submit report:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    }

    // Clean up object URLs when dialog closes
    if (!newOpen) {
      imagePreviews.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      imagePreviewsRef.current = [];
      setValidationErrors({});
      setIsDragOver(false);
    }
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                {t('screenshots-optional')} ({formData.images.length}/5)
              </Label>

              {formData.images.length < 5 && (
                <button
                  type="button"
                  className={cn(
                    'relative mt-2 w-full rounded-lg border-2 border-dashed transition-all duration-200',
                    isDragOver
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                      : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  aria-label="Click to upload or drag and drop images"
                >
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    disabled={isSubmitting}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    id={imageUploadId}
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
                      {isDragOver
                        ? 'Drop images here'
                        : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      PNG, JPG, GIF up to 1MB each
                    </p>
                  </div>
                </button>
              )}

              {validationErrors.images && (
                <div className="text-red-600 text-sm">
                  {validationErrors.images}
                </div>
              )}

              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {imagePreviews.map((preview, index) => (
                    <div key={preview} className="group relative">
                      <div className="aspect-square overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                        <Image
                          src={
                            isValidBlobUrl(preview)
                              ? preview
                              : '/placeholder.svg'
                          }
                          alt={t('screenshot-alt', { number: index + 1 })}
                          className="h-full w-full object-cover"
                          width={100}
                          height={100}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="-top-2 -right-2 absolute h-6 w-6 rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                        onClick={() => removeImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex w-full flex-col-reverse gap-3 border-t pt-4 sm:flex-row">
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
