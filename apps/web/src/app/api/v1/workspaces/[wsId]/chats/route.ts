import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    console.log('Chats API called with wsId:', wsId);

    // Check permissions
    const { withoutPermission } = await getPermissions({ wsId });
    console.log('Permission check result:', { withoutPermission: withoutPermission('ai_chat') });
    
    if (withoutPermission('ai_chat')) {
      console.log('Access denied for ai_chat permission');
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // For now, return empty data to avoid database issues
    console.log('Returning empty chat data for development');
    return NextResponse.json({
      data: [],
      count: 0,
    });

  } catch (error) {
    console.error('Error in chats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 