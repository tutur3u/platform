import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    userId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId, userId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('user_indicators')
    .select(`
      value,
      healthcare_vitals!inner(
        id,
        name,
        unit,
        factor,
        group_id
      )
    `)
    .eq('user_id', userId)
    .eq('healthcare_vitals.group_id', groupId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching user vitals' },
      { status: 500 }
    );
  }

  const result = (data || []).map((item) => {
    const vital = item.healthcare_vitals as unknown as {
      id: string;
      name: string;
      unit: string;
      factor: number;
    };

    return {
      id: vital.id,
      name: vital.name,
      unit: vital.unit,
      factor: vital.factor,
      value: item.value,
    };
  });

  return NextResponse.json(result);
}
