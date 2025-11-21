/**
 * Individual Experiment Endpoint
 * GET /api/v1/experiments/:id - Get experiment details
 * PATCH /api/v1/experiments/:id - Update experiment
 * DELETE /api/v1/experiments/:id - Delete experiment
 *
 * Requires authentication and appropriate permissions.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const experimentVariantSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  weight: z.number().min(0).max(1),
  config: z.record(z.unknown()).optional(),
});

const updateExperimentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  experiment_type: z
    .enum(['url_redirect', 'feature_flag', 'content_variant'])
    .optional(),
  traffic_allocation: z.number().min(0).max(1).optional(),
  variants: z.array(experimentVariantSchema).min(2).optional(),
  target_metric: z.string().max(255).optional(),
  status: z
    .enum(['draft', 'running', 'paused', 'completed', 'archived'])
    .optional(),
});

// GET - Get experiment details
export const GET = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;

    const supabase = createClient();

    const { data, error } = await supabase
      .from('analytics_experiments')
      .select('*')
      .eq('id', id)
      .eq('ws_id', wsId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Experiment not found',
        },
        { status: 404 }
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
      data: transformedData,
    });
  },
  {
    permissions: ['view_analytics', 'manage_experiments'],
    requireAll: false,
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);

// PATCH - Update experiment
export const PATCH = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;

    try {
      const body = await request.json();
      const validatedData = updateExperimentSchema.parse(body);

      // Validate variant weights if provided
      if (validatedData.variants) {
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
      }

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

      // Prevent editing running experiments (except status)
      if (existing.status === 'running' && validatedData.status !== 'paused') {
        const hasNonStatusChanges = Object.keys(validatedData).some(
          (key) => key !== 'status'
        );
        if (hasNonStatusChanges) {
          return NextResponse.json(
            {
              error: 'Bad Request',
              message:
                'Cannot modify running experiment. Pause it first or only change status.',
            },
            { status: 400 }
          );
        }
      }

      // Update experiment
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (validatedData.name !== undefined) updateData.name = validatedData.name;
      if (validatedData.description !== undefined)
        updateData.description = validatedData.description;
      if (validatedData.experiment_type !== undefined)
        updateData.experiment_type = validatedData.experiment_type;
      if (validatedData.traffic_allocation !== undefined)
        updateData.traffic_allocation = validatedData.traffic_allocation;
      if (validatedData.variants !== undefined)
        updateData.variants = validatedData.variants;
      if (validatedData.target_metric !== undefined)
        updateData.target_metric = validatedData.target_metric;
      if (validatedData.status !== undefined) updateData.status = validatedData.status;

      const { data, error } = await supabase
        .from('analytics_experiments')
        .update(updateData)
        .eq('id', id)
        .eq('ws_id', wsId)
        .select()
        .single();

      if (error) {
        console.error('Error updating experiment:', error);
        return NextResponse.json(
          {
            error: 'Internal Server Error',
            message: 'Failed to update experiment',
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
        message: 'Experiment updated successfully',
        data: transformedData,
      });
    } catch (error) {
      console.error('Error in update experiment endpoint:', error);

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

// DELETE - Delete experiment
export const DELETE = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;

    const supabase = createClient();

    // Check if experiment is running
    const { data: existing } = await supabase
      .from('analytics_experiments')
      .select('status')
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

    if (existing.status === 'running') {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Cannot delete running experiment. Stop it first.',
        },
        { status: 400 }
      );
    }

    // Delete experiment (cascade will handle variant assignments)
    const { error } = await supabase
      .from('analytics_experiments')
      .delete()
      .eq('id', id)
      .eq('ws_id', wsId);

    if (error) {
      console.error('Error deleting experiment:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to delete experiment',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Experiment deleted successfully',
    });
  },
  {
    permissions: ['manage_experiments'],
    rateLimit: { windowMs: 60000, maxRequests: 50 },
  }
);
