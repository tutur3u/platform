import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; email: string }> }
) {
  try {
    const supabase = await createClient();

    const { id, email } = await params;
    const decodedEmail = decodeURIComponent(email);

    // Check if the team exists
    const { error: teamError } = await supabase
      .from('nova_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (teamError) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Delete the invitation
    const { error } = await supabase
      .from('nova_team_emails')
      .delete()
      .eq('team_id', id)
      .eq('email', decodedEmail);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing team invitation:', error);
    return NextResponse.json(
      { error: 'Failed to remove team invitation' },
      { status: 500 }
    );
  }
}
