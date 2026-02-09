import { google } from '@tuturuuu/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { wsId } = await request.json();

    if (!wsId) {
      return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
    }

    // Initialize Supabase client
    const supabase = await createClient(request);

    // Get the current authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Get the Google tokens for this workspace
    const { data: googleTokens, error: tokensError } = await supabase
      .from('calendar_auth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .single();

    if (tokensError || !googleTokens?.access_token) {
      return NextResponse.json(
        { error: 'Google Calendar not connected for this workspace' },
        { status: 400 }
      );
    }

    // Initialize Google Calendar API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: googleTokens.access_token,
      refresh_token: googleTokens.refresh_token,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Fetch all calendars from Google
    const calendarListResponse = await calendar.calendarList.list();
    const calendars = calendarListResponse.data.items || [];

    console.log(`Found ${calendars.length} calendars from Google`);

    // Get existing connections to avoid duplicates
    const { data: existingConnections } = await supabase
      .from('calendar_connections')
      .select('calendar_id')
      .eq('ws_id', wsId);

    const existingCalendarIds = new Set(
      existingConnections?.map((c) => c.calendar_id) || []
    );

    // Create calendar connections for calendars that don't exist yet
    const newConnections = [];
    for (const cal of calendars) {
      if (!cal.id || existingCalendarIds.has(cal.id)) {
        console.log(`Skipping calendar ${cal.id} - already exists`);
        continue;
      }

      newConnections.push({
        ws_id: wsId,
        calendar_id: cal.id,
        calendar_name: cal.summary || cal.id,
        color: cal.backgroundColor || null,
        is_enabled: cal.selected !== false, // Enable by default unless explicitly not selected
      });
    }

    // Insert new connections in batch
    if (newConnections.length > 0) {
      const { error: insertError } = await supabase
        .from('calendar_connections')
        .insert(newConnections);

      if (insertError) {
        console.error('Error inserting calendar connections:', insertError);
        return NextResponse.json(
          { error: 'Failed to import calendar connections' },
          { status: 500 }
        );
      }
    }

    // Get all connections after import (ordered by created_at)
    const { data: allConnections } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      success: true,
      message: 'Calendars imported successfully',
      imported: newConnections.length,
      total: allConnections?.length || 0,
      connections: allConnections || [],
    });
  } catch (error) {
    console.error('Error importing calendars:', error);
    return NextResponse.json(
      {
        error: 'Failed to import calendars',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
