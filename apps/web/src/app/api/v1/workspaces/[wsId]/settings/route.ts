import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, { user, supabase }, { wsId }) => {
    try {
      const sbAdmin = await createAdminClient();

      // Verify workspace access
      const { data: memberCheck } = await supabase
        .from('workspace_members')
        .select('id:user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .single();

      if (!memberCheck) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }

      // Fetch workspace info to check if it's personal
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('personal')
        .eq('id', wsId)
        .maybeSingle();

      // Fetch workspace settings
      const { data: settings, error } = await sbAdmin
        .from('workspace_settings')
        .select('*')
        .eq('ws_id', wsId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching workspace settings:', error);
        return NextResponse.json(
          { error: 'Failed to fetch workspace settings' },
          { status: 500 }
        );
      }

      // For personal workspaces, always return null for missed_entry_date_threshold
      // This disables all time tracking request/threshold flows for personal workspaces
      if (workspace?.personal) {
        return NextResponse.json({
          ...settings,
          missed_entry_date_threshold: null,
        });
      }

      return NextResponse.json(settings);
    } catch (error) {
      console.error('Error in workspace settings API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 60, swr: 30 } }
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    try {
      const sbAdmin = await createAdminClient();

      // Verify workspace access
      const { data: memberCheck } = await supabase
        .from('workspace_members')
        .select('id:user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .single();

      if (!memberCheck) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const body = await request.json();

      // Update workspace settings
      const { data: settings, error } = await sbAdmin
        .from('workspace_settings')
        .upsert({
          ...body,
          ws_id: wsId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error updating workspace settings:', error);
        return NextResponse.json(
          { error: 'Failed to update workspace settings' },
          { status: 500 }
        );
      }

      return NextResponse.json(settings);
    } catch (error) {
      console.error('Error in workspace settings API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
