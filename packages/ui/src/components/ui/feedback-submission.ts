import { useMutation } from '@tanstack/react-query';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { submitProductFeedback } from '@tuturuuu/internal-api/product-feedback';
import type { Product, SupportType } from '@tuturuuu/types';
import { DEFAULT_PRODUCTS } from './report-problem-model';

/** English subject prefixes: the stored title is read by the product team. */
const SUBJECT_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  'feature-request': 'Feature Request',
};

export function buildFeedbackSubject(product: Product, type: SupportType) {
  const productLabel =
    DEFAULT_PRODUCTS.find((item) => item.value === product)?.label ?? product;
  return `${SUBJECT_LABELS[type] ?? type} - ${productLabel}`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export interface SubmitFeedbackInput {
  subject: string;
  suggestion: string;
  media: File[];
  /** Stable for retries of one submission so the intake deduplicates them. */
  idempotencyKey: string;
  /** Single-use Turnstile token; every attempt needs a fresh one. */
  turnstileToken: string;
}

export function useSubmitFeedbackMutation(
  apiOptions?: InternalApiClientOptions
) {
  return useMutation({
    mutationFn: async ({
      subject,
      suggestion,
      media,
      idempotencyKey,
      turnstileToken,
    }: SubmitFeedbackInput) => {
      const image = media[0];
      return submitProductFeedback(
        {
          title: subject,
          body: suggestion,
          idempotencyKey,
          turnstileToken,
          ...(image
            ? {
                media: {
                  contentType: image.type as
                    | 'image/png'
                    | 'image/jpeg'
                    | 'image/webp',
                  data: await fileToBase64(image),
                },
              }
            : {}),
        },
        apiOptions
      );
    },
  });
}
