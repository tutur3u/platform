/**
 * Analytics Conversion Tracking Endpoint
 * POST /api/v1/analytics/conversions
 *
 * Tracks conversion events (purchases, signups, etc.) with optional monetary values.
 * Automatically links to active experiments if the session is part of one.
 */

import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const trackConversionSchema = z.object({
  session_id: z.string().uuid(),
  conversion_type: z.string().min(1).max(255),
  conversion_value: z.number().min(0).optional(),
  conversion_properties: z.record(z.unknown()).optional(),
  event_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Parse and validate request body
    const body = await req.json();
    const validatedData = trackConversionSchema.parse(body);

    // Extract workspace ID
    const authHeader = req.headers.get('Authorization');
    let wsId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7).trim();

      const { data: keyData } = await supabase
        .from('workspace_api_keys')
        .select('ws_id, is_enabled, expires_at')
        .eq('api_key', apiKey)
        .single();

      if (keyData && keyData.is_enabled) {
        if (
          !keyData.expires_at ||
          new Date(keyData.expires_at) > new Date()
        ) {
          wsId = keyData.ws_id;
        }
      }
    }

    if (!wsId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: memberData } = await supabase
          .from('workspace_members')
          .select('ws_id')
          .eq('user_id', user.id)
          .limit(1)
          .single();

        if (memberData) {
          wsId = memberData.ws_id;
        }
      }
    }

    if (!wsId) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message:
            'Missing workspace context. Provide an API key or authenticate.',
        },
        { status: 401 }
      );
    }

    // Track conversion using RPC function (automatically links to experiments)
    const { data: conversionId, error: conversionError } = await supabase.rpc(
      'track_conversion',
      {
        p_ws_id: wsId,
        p_session_id: validatedData.session_id,
        p_conversion_type: validatedData.conversion_type,
        p_conversion_value: validatedData.conversion_value || null,
        p_conversion_properties: validatedData.conversion_properties || null,
        p_event_id: validatedData.event_id || null,
      }
    );

    if (conversionError) {
      console.error('Error tracking conversion:', conversionError);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to track conversion',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Conversion tracked successfully',
        data: {
          conversionId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in track conversion endpoint:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Invalid request body',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
