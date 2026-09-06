import { useMutation } from '@tanstack/react-query';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  createReportUploadUrls,
  deleteReportUploadPaths,
  submitReport,
} from '@tuturuuu/internal-api/reports';
import type { Product, SupportType } from '@tuturuuu/types';

interface SubmitReportMutationInput {
  product: Product;
  type: SupportType;
  suggestion: string;
  subject: string;
  media: File[];
}

export function useSubmitReportMutation(apiOptions?: InternalApiClientOptions) {
  return useMutation({
    mutationFn: async ({
      product,
      type,
      suggestion,
      subject,
      media,
    }: SubmitReportMutationInput) => {
      const uploadedPaths: string[] = [];

      const cleanupUploadedMedia = async () => {
        if (uploadedPaths.length === 0) {
          return;
        }

        try {
          await deleteReportUploadPaths({ paths: uploadedPaths }, apiOptions);
        } catch (cleanupError) {
          console.error(
            'Failed to clean up uploaded support report media:',
            cleanupError
          );
        }
      };

      try {
        if (media.length > 0) {
          const { uploads } = await createReportUploadUrls(
            {
              files: media.map((file) => ({
                filename: file.name,
                contentType: file.type,
                size: file.size,
              })),
            },
            apiOptions
          );

          if (uploads.length !== media.length) {
            throw new Error('Failed to prepare media uploads');
          }

          for (const [index, upload] of uploads.entries()) {
            const file = media[index];

            if (!file) {
              throw new Error('Missing media file during upload');
            }

            let uploadResponse = await fetch(upload.signedUrl, {
              method: 'PUT',
              cache: 'no-store',
              headers: {
                Authorization: `Bearer ${upload.token}`,
                'Content-Type': file.type || 'application/octet-stream',
              },
              body: file,
            });

            if (!uploadResponse.ok) {
              uploadResponse = await fetch(upload.signedUrl, {
                method: 'PUT',
                cache: 'no-store',
                headers: {
                  Authorization: `Bearer ${upload.token}`,
                },
                body: file,
              });
            }

            if (!uploadResponse.ok) {
              const text = await uploadResponse.text().catch(() => '');
              throw new Error(
                `Failed to upload media (${uploadResponse.status})${text ? `: ${text}` : ''}`
              );
            }

            uploadedPaths.push(upload.path);
          }
        }

        const result = await submitReport(
          {
            product,
            type,
            suggestion,
            subject,
            imagePaths: uploadedPaths,
          },
          apiOptions
        );

        if (!result.success) {
          throw new Error(result.message || 'Failed to submit report');
        }

        return result;
      } catch (error) {
        await cleanupUploadedMedia();
        throw error;
      }
    },
  });
}
