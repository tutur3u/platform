import { useQuery } from '@tanstack/react-query';
import { getTimeTrackingRequestImageUrls } from '@tuturuuu/internal-api/time-tracking';

export function useRequestImages(
  wsId: string,
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

      const signedUrls = await getTimeTrackingRequestImageUrls(
        wsId,
        requestId,
        imagePaths
      );

      return signedUrls
        .map((item) => item.signedUrl)
        .filter((url): url is string => Boolean(url));
    },
    enabled: enabled && !!imagePaths && imagePaths.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes (URLs valid for 1 hour, refresh halfway)
  });
}
