'use client';

import { useQuery } from '@tanstack/react-query';
import { getAiChatSignedReadUrls } from '@tuturuuu/internal-api/ai';

// Direct `<wsId>/mira/images/<file>` objects; the server re-checks access.
const MIRA_IMAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/mira\/images\/[^/]+$/i;
// Signed read URLs last 1 hour; refresh well before they expire.
const REFRESH_MS = 50 * 60 * 1000;

export type GeneratedImageSource = {
  storagePath: string | null;
  imageUrl: string | null;
};

export function parseGeneratedImageSource(
  outputRecord: Record<string, unknown> | null
): GeneratedImageSource {
  const storagePath =
    typeof outputRecord?.storagePath === 'string' &&
    MIRA_IMAGE_PATH.test(outputRecord.storagePath)
      ? outputRecord.storagePath
      : null;
  const imageUrl =
    typeof outputRecord?.imageUrl === 'string' && outputRecord.imageUrl
      ? outputRecord.imageUrl
      : null;
  return { imageUrl, storagePath };
}

/**
 * Signs a generated image on read from its `storagePath`, so chat history does
 * not depend on the signed URL stored in tool output (which expires, and is
 * revoked when the object is re-keyed). The stored `imageUrl` is only the
 * fallback while signing is pending or unavailable.
 */
export function useGeneratedImageUrl(
  outputRecord: Record<string, unknown> | null
): string | null {
  const { imageUrl, storagePath } = parseGeneratedImageSource(outputRecord);
  const signed = useQuery({
    enabled: storagePath !== null,
    queryFn: async () => {
      const [entry] = await getAiChatSignedReadUrls([storagePath as string]);
      return entry?.signedUrl ?? null;
    },
    queryKey: ['ai-chat', 'generated-image-url', storagePath],
    refetchInterval: REFRESH_MS,
    retry: 1,
    staleTime: REFRESH_MS,
  });
  return signed.data ?? imageUrl;
}
