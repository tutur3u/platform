import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import type { Product, SupportType } from '@tuturuuu/types';
import type React from 'react';
import { z } from 'zod';
export interface ReportProblemFormData {
  product: Product | '';
  type: SupportType | '';
  suggestion: string;
  media: File[];
}

// The intake accepts one PNG, JPEG or WebP screenshot of at most 2 MiB.
export const MAX_MEDIA_SIZE = 2 * 1024 * 1024;
export const MAX_FILES = 1;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Zod schema for form validation
export const reportProblemSchema = z.object({
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
      (files) => files.every((f) => ALLOWED_IMAGE_TYPES.includes(f.type)),
      {
        message: 'Only a PNG, JPEG or WebP image is allowed',
      }
    )
    .refine((files) => files.every((f) => f.size <= MAX_MEDIA_SIZE), {
      message: 'The image must be 2MB or less',
    }),
});

/** A receipt of the intake: the receipt id, its creation time and the submitted title. */
export interface FeedbackReceipt {
  id: string;
  title: string;
  createdAt: string;
}

export interface ReportProblemDialogProps {
  ImageComponent?: React.ComponentType<{
    src: string;
    alt: string;
    className: string;
    width: number;
    height: number;
  }>;
  t: (
    key:
      | 'affected-product-required'
      | 'cancel'
      | 'feedback-dialog-back'
      | 'feedback-dialog-captcha-failed'
      | 'feedback-dialog-captcha-unavailable'
      | 'feedback-dialog-characters'
      | 'feedback-dialog-close'
      | 'feedback-dialog-group'
      | 'feedback-dialog-history'
      | 'feedback-dialog-history-description'
      | 'feedback-dialog-history-empty'
      | 'feedback-dialog-history-error'
      | 'feedback-dialog-history-loading'
      | 'feedback-dialog-history-more'
      | 'feedback-dialog-history-retry'
      | 'feedback-dialog-no-results'
      | 'feedback-dialog-receipt-id'
      | 'feedback-dialog-remove-media'
      | 'feedback-dialog-search'
      | 'feedback-dialog-send'
      | 'feedback-dialog-send-description'
      | 'feedback-dialog-submit-failed'
      | 'feedback-dialog-support-type'
      | 'feedback-dialog-support-type-placeholder'
      | 'feedback-dialog-title'
      | 'feedback-dialog-type-bug'
      | 'feedback-dialog-type-feature-request'
      | 'feedback-dialog-upload-compressing'
      | 'feedback-dialog-upload-cta'
      | 'feedback-dialog-upload-drop'
      | 'feedback-dialog-upload-hint'
      | 'media-alt'
      | 'media-optional'
      | 'report-problem'
      | 'report-problem-description'
      | 'report-submitted-success'
      | 'select-product-placeholder'
      | 'submit-report'
      | 'submitting'
      | 'suggestion-improve'
      | 'suggestion-placeholder',
    values?: Record<string, string | number>
  ) => string;
  apiOptions?: InternalApiClientOptions;
  /** Called with the receipt of each submission the intake accepted. */
  onSubmitted?: (receipt: FeedbackReceipt) => void;
  /** Close the dialog after a submission. Defaults to true. */
  closeOnSubmit?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  products?: Array<{ value: Product; label: string }>;
  className?: string;
  trigger?: React.ReactNode;
  showTrigger?: boolean;
}

export const DEFAULT_PRODUCTS: Array<{ value: Product; label: string }> = [
  { value: 'web', label: 'Web Dashboard' },
  { value: 'nova', label: 'Nova' },
  { value: 'rewise', label: 'Rewise' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'finance', label: 'Finance' },
  { value: 'tudo', label: 'Tuturuuu Tasks' },
  { value: 'tumeet', label: 'Tuturuuu Meet' },
  { value: 'shortener', label: 'URL Shortener' },
  { value: 'qr', label: 'QR Code' },
  { value: 'drive', label: 'Drive' },
  { value: 'mail', label: 'Mail' },
  { value: 'other', label: 'Other' },
];

export const DEFAULT_SUPPORT_TYPES: Array<{
  value: SupportType;
  label: string;
}> = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature-request', label: 'Feature Request' },
];

export const LOCAL_STORAGE_KEY = 'report-problem-form-data';
