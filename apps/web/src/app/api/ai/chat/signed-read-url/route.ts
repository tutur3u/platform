import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const SignedReadUrlRequestSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(10),
});

/** Signed read URL validity: 1 hour */
const SIGNED_URL_EXPIRY_SECONDS = 3600;

/**
 * POST /api/ai/chat/signed-read-url
 *
 * Generates signed read URLs for one or more storage paths.
 * Used after uploading files to get persistent URLs that survive
 * blob URL revocation and page refreshes.
 *
 * Request body: { paths: string[] }
 * Response: { urls: Array<{ path: string; signedUrl: string | null }> }
 */
export const POST = withSessionAuth(
  async (req) => {
    try {
      const body = await req.json();
      const { paths } = SignedReadUrlRequestSchema.parse(body);

      const supabase = await createDynamicAdminClient();

      const { data: signedUrls, error } = await supabase.storage
        .from('workspaces')
        .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

      if (error) {
        console.error('Error creating signed read URLs:', error);
        return NextResponse.json(
          { message: 'Failed to generate read URLs' },
          { status: 500 }
        );
      }

      const urls = paths.map((path, index) => ({
        path,
        signedUrl: signedUrls?.[index]?.signedUrl ?? null,
      }));

      return NextResponse.json({ urls });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: err.issues },
          { status: 400 }
        );
      }

      console.error('Unexpected error in signed-read-url:', err);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAiTempAuth: true, rateLimitKind: 'read' }
);
