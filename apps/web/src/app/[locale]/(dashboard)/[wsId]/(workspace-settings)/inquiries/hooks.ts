'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listInquiryMediaUrls,
  type UpdateInquiryPayload,
  type UpdateInquiryResponse,
  updateInquiry,
} from '@tuturuuu/internal-api';

export interface InquiryUpdateMutationInput {
  updates: UpdateInquiryPayload;
  showToast?: boolean;
  closeOnSuccess?: boolean;
}

interface UseUpdateInquiryMutationOptions {
  onSuccess?: (input: InquiryUpdateMutationInput) => void;
  onError?: (error: unknown, input: InquiryUpdateMutationInput) => void;
}

export function useInquiryMediaUrlsQuery(
  inquiryId: string,
  mediaFiles: string[] | null
) {
  return useQuery({
    queryKey: ['inquiries', inquiryId, 'media-urls', mediaFiles],
    queryFn: async () => {
      if (!mediaFiles || mediaFiles.length === 0) {
        return {} as Record<string, string>;
      }

      return listInquiryMediaUrls(inquiryId, mediaFiles);
    },
    enabled: Boolean(inquiryId),
  });
}

export function useUpdateInquiryMutation(
  inquiryId: string,
  updateInquiryFn: (
    inquiryId: string,
    updates: UpdateInquiryPayload
  ) => Promise<UpdateInquiryResponse> = updateInquiry,
  options?: UseUpdateInquiryMutationOptions
) {
  return useMutation({
    mutationFn: async (input: InquiryUpdateMutationInput) =>
      updateInquiryFn(inquiryId, input.updates),
    onSuccess: (_, input) => {
      options?.onSuccess?.(input);
    },
    onError: (error, input) => {
      options?.onError?.(error, input);
    },
  });
}
