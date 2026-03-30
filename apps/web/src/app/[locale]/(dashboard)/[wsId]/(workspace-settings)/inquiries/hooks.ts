'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { listInquiryMediaUrls, updateInquiry } from '@tuturuuu/internal-api';

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

export function useUpdateInquiryMutation(inquiryId: string) {
  return useMutation({
    mutationFn: async (updates: { is_read?: boolean; is_resolved?: boolean }) =>
      updateInquiry(inquiryId, updates),
  });
}
