/**
 * Stop Experiment Endpoint
 * POST /api/v1/experiments/:id/stop - Stop a running experiment
 *
 * Requires authentication and manage_experiments permission.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

// POST - Stop experiment
export const POST = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;

    const supabase = createClient();

    // Check if experiment exists
    const { data: existing } = await supabase
      .from('analytics_experiments')
      .select('id, status')
      .eq('id', id)
      .eq('ws_id', wsId)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Experiment not found',
        },
        { status: 404 }
      );
    }

    // Validate status - can only stop running experiments
    if (existing.status !== 'running') {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: `Cannot stop experiment with status '${existing.status}'. Only 'running' experiments can be stopped.`,
        },
        { status: 400 }
      );
    }

    // Stop experiment
    const { data, error } = await supabase
      .from('analytics_experiments')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (error) {
      console.error('Error stopping experiment:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to stop experiment',
        },
        { status: 500 }
      );
    }

    // Transform to camelCase
    const transformedData = {
      id: data.id,
      wsId: data.ws_id,
      name: data.name,
      description: data.description,
      experimentKey: data.experiment_key,
      experimentType: data.experiment_type,
      status: data.status,
      trafficAllocation: data.traffic_allocation,
      variants: data.variants,
      targetMetric: data.target_metric,
      startedAt: data.started_at,
      endedAt: data.ended_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({
      message: 'Experiment stopped successfully',
      data: transformedData,
    });
  },
  {
    permissions: ['manage_experiments'],
    rateLimit: { windowMs: 60000, maxRequests: 50 },
  }
);
