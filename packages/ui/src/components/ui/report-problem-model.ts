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

export const MAX_MEDIA_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_FILES = 5;

// Allowed media types
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

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
