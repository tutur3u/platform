// PATCH /api/meet-together/plans/[planId]/edit-lock
import { createAdminClient, createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request, { params }: { params: { planId: string } }) {
  const { planId } = params;
  const { enableToEdit, isConfirm } = await req.json();
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  // Auth user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Check creator
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('creator_id')
    .eq('id', planId)
    .single();
  if (!plan || plan.creator_id !== user.id)
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  // Update
  const { error } = await sbAdmin
    .from('meet_together_plans')
    .update({
      enable_to_edit: typeof enableToEdit === 'boolean' ? enableToEdit : undefined,
      is_confirm: typeof isConfirm === 'boolean' ? isConfirm : undefined,
    })
    .eq('id', planId);

  if (error) return NextResponse.json({ message: 'Update failed', error }, { status: 500 });
  return NextResponse.json({ message: 'Plan updated' });
}
