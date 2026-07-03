import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const DELETE = withSessionAuth<{ identityId: string }>(
  async (_request, { supabase }, { identityId }) => {
    try {
      const { data, error } = await supabase.auth.getUserIdentities();

      if (error || !data) {
        return NextResponse.json(
          { message: error?.message || 'Failed to load linked identities' },
          { status: 400 }
        );
      }

      if (data.identities.length < 2) {
        return NextResponse.json(
          { message: 'At least one linked identity must remain' },
          { status: 400 }
        );
      }

      const identity = data.identities.find(
        (item) => item.id === identityId || item.identity_id === identityId
      );

      if (!identity) {
        return NextResponse.json(
          { message: 'Identity not found' },
          { status: 404 }
        );
      }

      const { error: unlinkError } =
        await supabase.auth.unlinkIdentity(identity);

      if (unlinkError) {
        return NextResponse.json(
          { message: unlinkError.message || 'Failed to unlink identity' },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error unlinking identity:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
