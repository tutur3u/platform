import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();

  // external_user_monthly_report_logs has 'id' as primary key (UUID)
  // Use id-based upsert for proper deduplication
  const { error } = await supabase
    .from('external_user_monthly_report_logs')
    .upsert(json?.data || [], {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating user monthly report logs' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
