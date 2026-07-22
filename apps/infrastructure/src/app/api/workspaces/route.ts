import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

export async function GET() {
  await connection();
  const auth = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles'
  );
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.sbAdmin
    .from('workspaces')
    .select('id,name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching infrastructure workspaces:', error);
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    (data ?? []).map((workspace) => ({
      ...workspace,
      color: 'bg-blue-500',
    }))
  );
}
