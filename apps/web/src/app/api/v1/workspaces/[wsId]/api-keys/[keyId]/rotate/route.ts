import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

// Schema for validating route params
const paramsSchema = z.object({
  wsId: z.string().uuid(),
  keyId: z.string().uuid(),
});

export const POST = withApiAuth(
  async (_, { context, params }) => {
    // Extract params from route
    const { wsId: paramsWsId, keyId } = params as {
      wsId: string;
      keyId: string;
    };

    // Validate params
    const paramValidation = paramsSchema.safeParse({ wsId: paramsWsId, keyId });
    if (!paramValidation.success) {
      return createErrorResponse(
        'Bad Request',
        'Invalid workspace ID or key ID',
        400,
        'INVALID_PARAMS'
      );
    }

    const { wsId: validatedWsId, keyId: validatedKeyId } = paramValidation.data;

    // Ensure the workspace ID from params matches the authenticated workspace ID from context
    if (validatedWsId !== context.wsId) {
      return createErrorResponse(
        'Forbidden',
        'Workspace ID mismatch',
        403,
        'WORKSPACE_MISMATCH'
      );
    }

    const wsId = validatedWsId;

    const supabase = await createClient();

    // Fetch the existing API key with workspace scoping
    // SECURITY: Only select 'id' to verify existence, no need for sensitive fields
    const { data: existingKey, error: fetchError } = await supabase
      .from('workspace_api_keys')
      .select('id')
      .eq('id', validatedKeyId)
      .eq('ws_id', wsId) // Ensure workspace scoping
      .single();

    if (fetchError || !existingKey) {
      console.error('Error fetching API key for rotation:', fetchError);
      return createErrorResponse(
        'Not Found',
        'API key not found',
        404,
        'API_KEY_NOT_FOUND'
      );
    }

    // Generate new API key and hash
    const { key, prefix } = generateApiKey();
    const keyHash = await hashApiKey(key);

    // Update the existing key record with new hash and prefix
    const { error: updateError } = await supabase
      .from('workspace_api_keys')
      .update({
        key_hash: keyHash,
        key_prefix: prefix,
        last_used_at: null, // Reset last used timestamp
      })
      .eq('id', validatedKeyId)
      .eq('ws_id', wsId); // Ensure workspace scoping

    if (updateError) {
      console.error('Error rotating API key:', updateError);
      return createErrorResponse(
        'Internal Server Error',
        'Error rotating API key',
        500,
        'API_KEY_ROTATION_ERROR'
      );
    }

    // Return the new plaintext key to the user (only time they'll see it)
    return NextResponse.json(
      {
        message: 'API key rotated successfully',
        key,
        prefix,
      },
      {
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  },
  { permissions: ['manage_api_keys'] }
);
