import type { Product, SupportType } from '@tuturuuu/types';
import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface CreateReportUploadUrlPayload {
  filename: string;
  contentType: string;
  size: number;
}

export interface CreateReportUploadUrlResponse {
  signedUrl: string;
  token: string;
  path: string;
}

export interface CreateReportUploadUrlsPayload {
  files: CreateReportUploadUrlPayload[];
}

export interface CreateReportUploadUrlsResponse {
  uploads: CreateReportUploadUrlResponse[];
}

export interface SubmitReportPayload {
  product: Product;
  type: SupportType;
  suggestion: string;
  subject: string;
  imagePaths?: string[];
}

export interface SubmitReportResponse {
  success: boolean;
  message: string;
  reportId: string;
  uploadedMedia: string[];
}

export async function createReportUploadUrl(
  payload: CreateReportUploadUrlPayload,
  options?: InternalApiClientOptions
) {
  const result = await createReportUploadUrls({ files: [payload] }, options);
  const firstUpload = result.uploads[0];

  if (!firstUpload) {
    throw new Error('Missing upload URL payload');
  }

  return firstUpload;
}

export async function createReportUploadUrls(
  payload: CreateReportUploadUrlsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CreateReportUploadUrlsResponse>(
    '/api/reports/upload-url',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function submitReport(
  payload: SubmitReportPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SubmitReportResponse>('/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}
