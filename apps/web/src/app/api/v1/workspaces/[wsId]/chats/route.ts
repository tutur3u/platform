import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;

    // Check permissions
    const { withoutPermission } = await getPermissions({ wsId });
    
    if (withoutPermission('ai_chat')) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
      // Fetch AI chats for the workspace
      const { data: chats, error } = await supabase
        .from('ai_chats')
        .select(`
          id,
          title,
          created_at,
          updated_at,
          model,
          summary,
          pinned,
          is_public
        `)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(50); // Limit to recent chats

      if (error) {
        console.error('Error fetching chats:', error);
        return NextResponse.json(
          { error: 'Failed to fetch chats' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        chats: chats || [],
        count: chats?.length || 0,
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      // Fallback to empty data if database is not available
      return NextResponse.json({
        chats: [],
        count: 0,
      });
    }

  } catch (error) {
    console.error('Error in chats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 