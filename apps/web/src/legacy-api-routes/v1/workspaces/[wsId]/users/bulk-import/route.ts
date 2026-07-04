import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateUUID } from '@tuturuuu/utils/uuid-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const ImportUserSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
});

const BulkImportSchema = z.array(ImportUserSchema);

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('manage_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = BulkImportSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const usersToImport = parsed.data;
  const sbAdmin = await createAdminClient();

  try {
    // Fetch existing users' emails in this workspace
    const { data: existingUsers, error: fetchError } = await sbAdmin
      .from('workspace_users')
      .select('email')
      .eq('ws_id', wsId);

    if (fetchError) throw fetchError;

    const existingEmails = new Set(
      (existingUsers || []).map((u) => u.email?.toLowerCase()).filter(Boolean)
    );

    // Filter out users that already exist
    const newUsers = usersToImport.filter(
      (user) => !existingEmails.has(user.email.toLowerCase())
    );

    if (newUsers.length === 0) {
      return NextResponse.json({ message: 'No new users to import' });
    }

    const rowsPerBatch = 100;
    const totalBatches = Math.ceil(newUsers.length / rowsPerBatch);

    for (let i = 0; i < totalBatches; i++) {
      const batch = newUsers.slice(i * rowsPerBatch, (i + 1) * rowsPerBatch);
      const formattedBatch = batch.map((row) => ({
        id: generateUUID(wsId, row.email.toLowerCase()),
        full_name: row.fullName,
        email: row.email.toLowerCase(),
        ws_id: wsId,
      }));

      const { error: insertError } = await sbAdmin
        .from('workspace_users')
        .insert(formattedBatch);

      if (insertError) throw insertError;
    }

    return NextResponse.json({ message: 'success', count: newUsers.length });
  } catch (error) {
    console.error('Error in bulk import:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
