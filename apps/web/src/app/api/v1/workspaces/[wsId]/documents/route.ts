import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/db';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { getFeatureFlag } from '@tuturuuu/utils/feature-flags/core';
import {
  documentCreateSchema,
  hasHierarchyFields,
} from '@/lib/documents/payload';
import {
  attachDocumentOwner,
  type DocumentOwner,
  type WorkspaceDocumentRow,
} from '@/lib/documents/present';
import {
  insertDocumentWithSchemaFallback,
  restoreDocumentMetadata,
  selectDocumentsWithSchemaFallback,
} from '@/lib/documents/schema-fallback';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  const { wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions || permissions.withoutPermission('manage_documents')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await connection();
  const hierarchyEnabled = await getFeatureFlag(
    wsId,
    'ENABLE_DOCUMENT_HIERARCHY'
  );
  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const parsedLimit = Number.parseInt(
    url.searchParams.get('limit') ?? '50',
    10
  );
  const parsedOffset = Number.parseInt(
    url.searchParams.get('offset') ?? '0',
    10
  );
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 100)
    : 50;
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  const {
    result: { data, error, count },
    legacy,
  } = await selectDocumentsWithSchemaFallback(
    hierarchyEnabled,
    (columns, legacy) => {
      let query = sbAdmin
        .from('workspace_documents')
        .select(columns, { count: 'exact' })
        .eq('ws_id', wsId)
        .order(legacy ? 'created_at' : 'updated_at', { ascending: false })
        .order('id', { ascending: false });

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }
      return query.range(offset, offset + limit - 1);
    }
  );

  if (error) {
    console.error('Error listing documents:', error.message);
    return NextResponse.json(
      { message: 'Error listing documents' },
      { status: 500 }
    );
  }

  // documentColumns() is not a select literal, so the client types the rows as a parser error.
  const rows = ((data ?? []) as unknown as WorkspaceDocumentRow[]).map((row) =>
    restoreDocumentMetadata(row, legacy)
  );
  const ownerIds: string[] = [];
  const seenOwners = new Set<string>();
  for (const row of rows) {
    const ownerId = row.owner_id;
    if (typeof ownerId !== 'string' || seenOwners.has(ownerId)) continue;
    seenOwners.add(ownerId);
    ownerIds.push(ownerId);
  }
  const owners = await loadDocumentOwners(supabase, ownerIds);
  if (owners == null) {
    return NextResponse.json(
      { message: 'Error listing documents' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: rows.map((row) => attachDocumentOwner(row, owners, user.id)),
    pagination: {
      limit,
      offset,
      filteredTotal: count ?? 0,
    },
  });
}

async function loadDocumentOwners(
  supabase: SupabaseClient<Database>,
  ownerIds: string[]
): Promise<DocumentOwner[] | null> {
  if (ownerIds.length === 0) return [];
  // The viewer's session applies profile RLS, so a former member's row is hidden.
  // The display name is the only profile field this response may carry.
  const { data, error } = await supabase
    .from('user_private_details')
    .select('user_id, full_name')
    .in('user_id', ownerIds);
  if (error) {
    console.error('Error loading document owners:', error.message);
    return null;
  }
  return data ?? [];
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  const { wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id, supabase);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions || permissions.withoutPermission('manage_documents')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = documentCreateSchema.safeParse(
    await req.json().catch(() => undefined)
  );
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid document payload' },
      { status: 400 }
    );
  const data = parsed.data;
  if (
    hasHierarchyFields(data) &&
    !(await getFeatureFlag(wsId, 'ENABLE_DOCUMENT_HIERARCHY'))
  ) {
    return NextResponse.json(
      { message: 'Document hierarchy is disabled' },
      { status: 403 }
    );
  }

  const { data: doc, error } = await insertDocumentWithSchemaFallback(
    sbAdmin,
    { ...data, ws_id: wsId },
    user.id
  );

  if (error) {
    console.error('Error creating document:', error.message);
    return NextResponse.json(
      { message: 'Error creating document' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: doc.id, message: 'success' });
}
