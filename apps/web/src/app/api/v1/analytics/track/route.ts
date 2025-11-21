/**
 * Analytics Event Tracking Endpoint
 * POST /api/v1/analytics/track
 *
 * Tracks a single analytics event with session data.
 * This endpoint is public (no authentication required) to allow client-side tracking.
 */

import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Request schema
const trackEventSchema = z.object({
  session_id: z.string().uuid(),
  event_name: z.string().min(1).max(255),
  event_properties: z.record(z.unknown()).optional(),
  page_url: z.string().url().optional(),
  page_title: z.string().max(500).optional(),
  referrer: z.string().url().optional(),
  utm_source: z.string().max(255).optional(),
  utm_medium: z.string().max(255).optional(),
  utm_campaign: z.string().max(255).optional(),
  utm_term: z.string().max(255).optional(),
  utm_content: z.string().max(255).optional(),
  session_data: z
    .object({
      visitor_id: z.string(),
      device_type: z.string().optional(),
      device_brand: z.string().optional(),
      device_model: z.string().optional(),
      browser: z.string().optional(),
      browser_version: z.string().optional(),
      os: z.string().optional(),
      os_version: z.string().optional(),
      screen_width: z.number().optional(),
      screen_height: z.number().optional(),
      language: z.string().optional(),
      user_agent: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Parse and validate request body
    const body = await req.json();
    const validatedData = trackEventSchema.parse(body);

    // Extract workspace ID from API key (via authentication)
    // For public tracking, we need the workspace ID to be passed or derived
    // For now, let's get it from the session or require it in the request
    const authHeader = req.headers.get('Authorization');
    let wsId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      // If API key is provided, validate and get workspace
      const apiKey = authHeader.substring(7).trim();

      const { data: keyData } = await supabase
        .from('workspace_api_keys')
        .select('ws_id, is_enabled, expires_at')
        .eq('api_key', apiKey)
        .single();

      if (keyData && keyData.is_enabled) {
        // Check expiration
        if (
          !keyData.expires_at ||
          new Date(keyData.expires_at) > new Date()
        ) {
          wsId = keyData.ws_id;
        }
      }
    }

    // If no API key, try to get workspace from session
    // This allows authenticated users to track events for their workspace
    if (!wsId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Get user's default workspace
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

    // Get client IP address and geo headers from Vercel
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    const country = req.headers.get('x-vercel-ip-country');
    const countryRegion = req.headers.get('x-vercel-ip-country-region');
    const city = req.headers.get('x-vercel-ip-city');
    const latitude = req.headers.get('x-vercel-ip-latitude');
    const longitude = req.headers.get('x-vercel-ip-longitude');
    const timezone = req.headers.get('x-vercel-ip-timezone');

    // Upsert session if session_data is provided
    if (validatedData.session_data) {
      const sessionData = {
        id: validatedData.session_id,
        ws_id: wsId,
        visitor_id: validatedData.session_data.visitor_id,
        ip_address: ip,
        country,
        country_region: countryRegion,
        city,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        timezone,
        device_type: validatedData.session_data.device_type,
        device_brand: validatedData.session_data.device_brand,
        device_model: validatedData.session_data.device_model,
        browser: validatedData.session_data.browser,
        browser_version: validatedData.session_data.browser_version,
        os: validatedData.session_data.os,
        os_version: validatedData.session_data.os_version,
        screen_width: validatedData.session_data.screen_width,
        screen_height: validatedData.session_data.screen_height,
        language: validatedData.session_data.language,
        user_agent: validatedData.session_data.user_agent,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      // Upsert session
      const { error: sessionError } = await supabase
        .from('analytics_sessions')
        .upsert(sessionData, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

      if (sessionError) {
        console.error('Error upserting session:', sessionError);
        return NextResponse.json(
          {
            error: 'Internal Server Error',
            message: 'Failed to create session',
          },
          { status: 500 }
        );
      }
    }

    // Track event using RPC function
    const { data: eventId, error: eventError } = await supabase.rpc(
      'track_analytics_event',
      {
        p_ws_id: wsId,
        p_session_id: validatedData.session_id,
        p_event_name: validatedData.event_name,
        p_event_properties: validatedData.event_properties || null,
        p_page_url: validatedData.page_url || null,
        p_page_title: validatedData.page_title || null,
        p_referrer: validatedData.referrer || null,
        p_utm_source: validatedData.utm_source || null,
        p_utm_medium: validatedData.utm_medium || null,
        p_utm_campaign: validatedData.utm_campaign || null,
        p_utm_term: validatedData.utm_term || null,
        p_utm_content: validatedData.utm_content || null,
      }
    );

    if (eventError) {
      console.error('Error tracking event:', eventError);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to track event',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Event tracked successfully',
        data: {
          event_id: eventId,
          session_id: validatedData.session_id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in track event endpoint:', error);

    // Handle Zod validation errors
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
