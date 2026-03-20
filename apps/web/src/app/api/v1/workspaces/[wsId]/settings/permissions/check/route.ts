import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const url = new URL(request.url);
  const permission = url.searchParams.get('permission');

  if (!permission) {
    return NextResponse.json(
      { message: 'Missing permission' },
      { status: 400 }
    );
  }

  try {
    const permissions = await getPermissions({ wsId, request });

    if (!permissions) {
      return NextResponse.json(
        { message: 'Workspace access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      hasPermission: permissions.containsPermission(permission as never),
    });
  } catch (error) {
    console.error('Error checking workspace permission:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
