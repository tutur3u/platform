/**
 * Experiments Endpoint
 * POST /api/v1/experiments - Create experiment
 * GET /api/v1/experiments - List experiments
 *
 * Requires authentication and manage_experiments permission.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schemas
const experimentVariantSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  weight: z.number().min(0).max(1),
  config: z.record(z.unknown()).optional(),
});

const createExperimentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  experiment_key: z.string().min(1).max(255),
  experiment_type: z.enum(['url_redirect', 'feature_flag', 'content_variant']),
  traffic_allocation: z.number().min(0).max(1).default(1.0),
  variants: z.array(experimentVariantSchema).min(2),
  target_metric: z.string().max(255).optional(),
});

// POST - Create experiment
export const POST = withApiAuth(
  async (request: NextRequest, { context }) => {
    const { wsId } = context;

    try {
      const body = await request.json();
      const validatedData = createExperimentSchema.parse(body);

      // Validate that variant weights sum to 1.0
      const totalWeight = validatedData.variants.reduce(
        (sum, v) => sum + v.weight,
        0
      );
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: 'Variant weights must sum to 1.0',
          },
          { status: 400 }
        );
      }

      const supabase = createClient();

      // Check if experiment_key already exists in workspace
      const { data: existing } = await supabase
        .from('analytics_experiments')
        .select('id')
        .eq('ws_id', wsId)
        .eq('experiment_key', validatedData.experiment_key)
        .single();

      if (existing) {
        return NextResponse.json(
          {
            error: 'Conflict',
            message: 'An experiment with this key already exists',
          },
          { status: 409 }
        );
      }

      // Create experiment
      const { data, error } = await supabase
        .from('analytics_experiments')
        .insert({
          ws_id: wsId,
          name: validatedData.name,
          description: validatedData.description,
          experiment_key: validatedData.experiment_key,
          experiment_type: validatedData.experiment_type,
          traffic_allocation: validatedData.traffic_allocation,
          variants: validatedData.variants,
          target_metric: validatedData.target_metric,
          status: 'draft',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating experiment:', error);
        return NextResponse.json(
          {
            error: 'Internal Server Error',
            message: 'Failed to create experiment',
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

      return NextResponse.json(
        {
          message: 'Experiment created successfully',
          data: transformedData,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Error in create experiment endpoint:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: 'Invalid request body',
            details: error.errors,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
        },
        { status: 500 }
      );
    }
  },
  {
    permissions: ['manage_experiments'],
    rateLimit: { windowMs: 60000, maxRequests: 50 },
  }
);

// GET - List experiments
export const GET = withApiAuth(
  async (request: NextRequest, { context }) => {
    const { wsId } = context;
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const experimentType = searchParams.get('experiment_type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createClient();

    // Build query
    let query = supabase
      .from('analytics_experiments')
      .select('*', { count: 'exact' })
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (experimentType) {
      query = query.eq('experiment_type', experimentType);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching experiments:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch experiments',
        },
        { status: 500 }
      );
    }

    // Transform to camelCase
    const transformedData = (data || []).map((exp) => ({
      id: exp.id,
      wsId: exp.ws_id,
      name: exp.name,
      description: exp.description,
      experimentKey: exp.experiment_key,
      experimentType: exp.experiment_type,
      status: exp.status,
      trafficAllocation: exp.traffic_allocation,
      variants: exp.variants,
      targetMetric: exp.target_metric,
      startedAt: exp.started_at,
      endedAt: exp.ended_at,
      createdAt: exp.created_at,
      updatedAt: exp.updated_at,
    }));

    return NextResponse.json({
      data: transformedData,
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    });
  },
  {
    permissions: ['view_analytics', 'manage_experiments'],
    requireAll: false, // Either permission is sufficient
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
