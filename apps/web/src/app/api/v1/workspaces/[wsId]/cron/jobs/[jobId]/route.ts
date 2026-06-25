import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { listEnabledManagedCronDomains } from '@/lib/managed-cron/domain-repository';
import {
  assertValidManagedCronSchedule,
  getNextManagedCronRunAt,
  managedCronJobPayloadSchema,
  validateManagedCronEndpointUrl,
} from '@/lib/managed-cron/validation';

interface Params {
  params: Promise<{
    wsId: string;
    jobId: string;
  }>;
}

async function parseCronJobPayload(req: Request) {
  let json: unknown;

  try {
    json = await req.json();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Malformed JSON payload' },
        { status: 400 }
      ),
    };
  }

  const parsed = managedCronJobPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          message: 'Invalid cron job payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      ),
    };
  }

  try {
    assertValidManagedCronSchedule(parsed.data.schedule);
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid cron schedule' },
        { status: 400 }
      ),
    };
  }

  const endpointUrl = parsed.data.endpoint_url;
  let normalizedEndpointUrl: string | null = null;

  if (endpointUrl) {
    const allowedDomains = await listEnabledManagedCronDomains();
    const validation = validateManagedCronEndpointUrl(
      endpointUrl,
      allowedDomains
    );

    if (!validation.ok || !validation.url) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { message: validation.message ?? 'Invalid endpoint URL' },
          { status: 400 }
        ),
      };
    }

    normalizedEndpointUrl = validation.url;
  }

  return {
    ok: true as const,
    payload: {
      active: parsed.data.active,
      dataset_id: parsed.data.dataset_id,
      endpoint_url: normalizedEndpointUrl,
      headers_config: parsed.data.headers_config,
      http_method: parsed.data.http_method,
      name: parsed.data.name,
      next_run_at: parsed.data.active
        ? getNextManagedCronRunAt(parsed.data.schedule).toISOString()
        : null,
      retry_count: parsed.data.retry_count,
      schedule: parsed.data.schedule,
      timeout_ms: parsed.data.timeout_ms,
    },
  };
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { jobId, wsId } = await params;

  const { data, error } = await supabase
    .from('workspace_cron_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('ws_id', wsId)
    .single();

  if (error) {
    serverLogger.error('Error fetching workspace cron job', error);
    return NextResponse.json(
      { message: 'Error fetching workspace cron job' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { jobId, wsId } = await params;
  const parsed = await parseCronJobPayload(req);

  if (!parsed.ok) return parsed.response;

  const { error } = await (supabase.from('workspace_cron_jobs') as any)
    .update(parsed.payload)
    .eq('id', jobId)
    .eq('ws_id', wsId);

  if (error) {
    serverLogger.error('Error updating workspace cron job', error);
    return NextResponse.json(
      { message: 'Error updating workspace cron job' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { jobId, wsId } = await params;

  const { error } = await supabase
    .from('workspace_cron_jobs')
    .delete()
    .eq('id', jobId)
    .eq('ws_id', wsId);

  if (error) {
    serverLogger.error('Error deleting workspace cron job', error);
    return NextResponse.json(
      { message: 'Error deleting workspace cron job' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
