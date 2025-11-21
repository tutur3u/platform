/**
 * Start Experiment Endpoint
 * POST /api/v1/experiments/:id/start - Start an experiment
 *
 * Requires authentication and manage_experiments permission.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

// POST - Start experiment
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
      .select('id, status, experiment_type, variants')
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

    // Validate status - can only start draft or paused experiments
    if (existing.status !== 'draft' && existing.status !== 'paused') {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: `Cannot start experiment with status '${existing.status}'. Only 'draft' or 'paused' experiments can be started.`,
        },
        { status: 400 }
      );
    }

    // Validate experiment configuration before starting
    if (!existing.variants || existing.variants.length < 2) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Experiment must have at least 2 variants before starting',
        },
        { status: 400 }
      );
    }

    // Validate variant weights sum to 1.0
    const totalWeight = existing.variants.reduce(
      (sum: number, v: any) => sum + v.weight,
      0
    );
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Variant weights must sum to 1.0 before starting experiment',
        },
        { status: 400 }
      );
    }

    // Start experiment
    const updateData: any = {
      status: 'running',
      updated_at: new Date().toISOString(),
    };

    // Set started_at only if this is the first time starting
    if (existing.status === 'draft') {
      updateData.started_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('analytics_experiments')
      .update(updateData)
      .eq('id', id)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (error) {
      console.error('Error starting experiment:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to start experiment',
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
      message: 'Experiment started successfully',
      data: transformedData,
    });
  },
  {
    permissions: ['manage_experiments'],
    rateLimit: { windowMs: 60000, maxRequests: 50 },
  }
);
