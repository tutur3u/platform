/**
 * Experiment Variant Assignment Endpoint
 * GET /api/v1/experiments/:key/variant - Get assigned variant for a visitor
 *
 * Public endpoint that requires API key for workspace identification.
 * Uses deterministic hashing to ensure consistent variant assignment.
 */

import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { key: string } }
) {
  const { key: experimentKey } = params;
  const { searchParams } = new URL(req.url);

  const visitorId = searchParams.get('visitor_id');

  if (!visitorId) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'visitor_id query parameter is required',
      },
      { status: 400 }
    );
  }

  // Get workspace from API key
  const authHeader = req.headers.get('Authorization');
  let wsId: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7).trim();
    const supabase = createClient();

    const { data: keyData } = await supabase
      .from('workspace_api_keys')
      .select('ws_id, name')
      .eq('api_key', apiKey)
      .single();

    if (keyData) {
      wsId = keyData.ws_id;
    }
  }

  if (!wsId) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Valid API key required in Authorization header',
      },
      { status: 401 }
    );
  }

  const supabase = createClient();

  // Get experiment by key and workspace
  const { data: experiment, error: experimentError } = await supabase
    .from('analytics_experiments')
    .select('id, name, status, traffic_allocation, variants')
    .eq('experiment_key', experimentKey)
    .eq('ws_id', wsId)
    .single();

  if (experimentError || !experiment) {
    return NextResponse.json(
      {
        error: 'Not Found',
        message: 'Experiment not found',
      },
      { status: 404 }
    );
  }

  // Check if experiment is running
  if (experiment.status !== 'running') {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: `Experiment is not running (current status: ${experiment.status})`,
        inExperiment: false,
      },
      { status: 400 }
    );
  }

  // Call RPC function to get variant assignment
  const { data: assignmentData, error: assignmentError } = await supabase.rpc(
    'get_experiment_variant',
    {
      p_experiment_id: experiment.id,
      p_visitor_id: visitorId,
    }
  );

  if (assignmentError) {
    console.error('Error getting variant assignment:', assignmentError);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to assign variant',
      },
      { status: 500 }
    );
  }

  // Check if visitor is in the experiment (based on traffic allocation)
  if (!assignmentData || !assignmentData.variant_id) {
    return NextResponse.json({
      data: {
        experimentKey,
        experimentName: experiment.name,
        inExperiment: false,
        variant: null,
      },
    });
  }

  // Find the variant details
  const assignedVariant = experiment.variants.find(
    (v: any) => v.id === assignmentData.variant_id
  );

  if (!assignedVariant) {
    console.error('Assigned variant not found in experiment variants');
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Variant configuration error',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      experimentKey,
      experimentName: experiment.name,
      inExperiment: true,
      variant: {
        id: assignedVariant.id,
        name: assignedVariant.name,
        config: assignedVariant.config || {},
      },
    },
  });
}
