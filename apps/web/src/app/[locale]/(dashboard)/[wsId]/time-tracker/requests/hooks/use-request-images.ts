import { useQuery } from '@tanstack/react-query';
import { createDynamicClient } from '@tuturuuu/supabase/next/client';

export function useRequestImages(
  requestId: string,
  imagePaths: string[] | null | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['time-tracking-request-images', requestId, imagePaths],
    queryFn: async () => {
      if (!imagePaths || imagePaths.length === 0) {
        return [];
      }

      const storageClient = createDynamicClient();
      const urls = await Promise.all(
        imagePaths.map(async (imagePath) => {
          const { data } = await storageClient.storage
            .from('time_tracking_requests')
            .createSignedUrl(imagePath, 3600);
          return data?.signedUrl || '';
        })
      );
      return urls.filter(Boolean);
    },
    enabled: enabled && !!imagePaths && imagePaths.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes (URLs valid for 1 hour, refresh halfway)
  });
}
