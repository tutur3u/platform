import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  q: z.string().optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z
    .enum(['active', 'on_leave', 'terminated', 'rehired', 'all'])
    .optional()
    .default('all'),
});

const createContractSchema = z.object({
  user_id: z.string().uuid(),
  contract_type: z
    .enum(['full_time', 'part_time', 'contractor', 'intern', 'temporary'])
    .optional()
    .default('full_time'),
  employment_status: z
    .enum(['active', 'on_leave', 'terminated', 'rehired'])
    .optional()
    .default('active'),
  job_title: z.string().optional(),
  department: z.string().optional(),
  working_location: z.string().optional(),
  start_date: z.string(), // ISO date string
  end_date: z.string().optional().nullable(),
  notes: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const result = querySchema.safeParse(searchParams);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', issues: result.error.issues },
        { status: 400 }
      );
    }

    const { q, page, pageSize, status } = result.data;
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for view_workforce or manage_workforce permission
    const { containsPermission } = await getPermissions({
      wsId: normalizedWsId,
    });

    if (
      !containsPermission('view_workforce') &&
      !containsPermission('manage_workforce')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build query - Get workspace users with their active contracts
    let query = supabase
      .from('workspace_users')
      .select(
        `
        *,
        workforce_contracts (
          id,
          contract_type,
          employment_status,
          job_title,
          department,
          start_date,
          end_date,
          created_at
        )
      `,
        { count: 'exact' }
      )
      .eq('ws_id', normalizedWsId);

    // Apply search filter
    if (q) {
      query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    // Apply pagination
    const start = (page - 1) * pageSize;
    query = query.range(start, start + pageSize - 1);

    // Order by full_name
    query = query.order('full_name', { ascending: true, nullsFirst: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching workforce users:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workforce users' },
        { status: 500 }
      );
    }

    // Filter by employment status if specified
    let filteredData = data || [];
    if (status !== 'all') {
      filteredData = filteredData.filter((user: any) => {
        const contracts = user.workforce_contracts || [];
        // Get the most recent active contract
        const activeContract = contracts.find(
          (c: any) =>
            c.employment_status === status &&
            (!c.end_date || new Date(c.end_date) >= new Date())
        );
        return !!activeContract;
      });
    }

    // Enrich with current contract info
    const enrichedData = filteredData.map((user: any) => {
      const contracts = user.workforce_contracts || [];
      // Find current active contract (no end_date or end_date in future)
      const currentContract =
        contracts.find(
          (c: any) => !c.end_date || new Date(c.end_date) >= new Date()
        ) ||
        contracts[0] ||
        null;

      return {
        ...user,
        current_contract: currentContract,
        contracts_count: contracts.length,
      };
    });

    return NextResponse.json({
      data: enrichedData,
      count: count || 0,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error in workforce users API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const body = await req.json();
    const result = createContractSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: result.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for manage_workforce permission
    const { containsPermission } = await getPermissions({
      wsId: normalizedWsId,
    });

    if (!containsPermission('manage_workforce')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the user_id exists in workspace_users
    const { data: workspaceUser, error: userError } = await supabase
      .from('workspace_users')
      .select('id')
      .eq('id', result.data.user_id)
      .eq('ws_id', normalizedWsId)
      .single();

    if (userError || !workspaceUser) {
      return NextResponse.json(
        { error: 'User not found in workspace' },
        { status: 404 }
      );
    }

    // Create the contract
    const { data: contract, error: createError } = await supabase
      .from('workforce_contracts')
      .insert({
        ws_id: normalizedWsId,
        user_id: result.data.user_id,
        contract_type: result.data.contract_type,
        employment_status: result.data.employment_status,
        job_title: result.data.job_title,
        department: result.data.department,
        working_location: result.data.working_location,
        start_date: result.data.start_date,
        end_date: result.data.end_date,
        notes: result.data.notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating contract:', createError);
      return NextResponse.json(
        { error: 'Failed to create contract' },
        { status: 500 }
      );
    }

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error('Error in workforce users POST API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
