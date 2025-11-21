/**
 * Experiment Results Endpoint
 * GET /api/v1/experiments/:id/results - Get experiment results with statistical analysis
 *
 * Requires authentication and view_analytics or manage_experiments permission.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

// GET - Get experiment results
export const GET = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;

    const supabase = createClient();

    // Check if experiment exists
    const { data: experiment, error: experimentError } = await supabase
      .from('analytics_experiments')
      .select('*')
      .eq('id', id)
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

    // Get results from RPC function
    const { data: resultsData, error: resultsError } = await supabase.rpc(
      'get_experiment_results',
      {
        p_experiment_id: id,
      }
    );

    if (resultsError) {
      console.error('Error fetching experiment results:', resultsError);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch experiment results',
        },
        { status: 500 }
      );
    }

    // Transform results to include variant details
    const variantResults = (resultsData || []).map((result: any) => {
      // Find variant details from experiment config
      const variantConfig = experiment.variants.find(
        (v: any) => v.id === result.variant_id
      );

      return {
        variantId: result.variant_id,
        variantName: variantConfig?.name || result.variant_id,
        variantWeight: variantConfig?.weight || 0,
        sessions: Number(result.sessions) || 0,
        conversions: Number(result.conversions) || 0,
        conversionRate: Number(result.conversion_rate) || 0,
        uniqueVisitors: Number(result.unique_visitors) || 0,
      };
    });

    // Calculate overall statistics
    const totalSessions = variantResults.reduce(
      (sum, v) => sum + v.sessions,
      0
    );
    const totalConversions = variantResults.reduce(
      (sum, v) => sum + v.conversions,
      0
    );
    const totalVisitors = variantResults.reduce(
      (sum, v) => sum + v.uniqueVisitors,
      0
    );
    const overallConversionRate =
      totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;

    // Find best performing variant (highest conversion rate)
    const bestVariant =
      variantResults.length > 0
        ? variantResults.reduce((best, current) =>
            current.conversionRate > best.conversionRate ? current : best
          )
        : null;

    // Calculate statistical significance using chi-square test
    // For A/B testing, we compare against control (typically first variant)
    const controlVariant = variantResults[0];
    const statisticalAnalysis =
      variantResults.length >= 2 && controlVariant
        ? variantResults.slice(1).map((variant) => {
            const chiSquare = calculateChiSquare(
              controlVariant.conversions,
              controlVariant.sessions - controlVariant.conversions,
              variant.conversions,
              variant.sessions - variant.conversions
            );

            // Chi-square critical value at 95% confidence (1 degree of freedom) = 3.841
            const isSignificant = chiSquare > 3.841;
            const pValue = chiSquareToPValue(chiSquare);

            return {
              variantId: variant.variantId,
              variantName: variant.variantName,
              comparedTo: controlVariant.variantId,
              chiSquare,
              pValue,
              isSignificant,
              confidence: isSignificant ? '95%+' : '<95%',
              uplift:
                controlVariant.conversionRate > 0
                  ? (
                      ((variant.conversionRate -
                        controlVariant.conversionRate) /
                        controlVariant.conversionRate) *
                      100
                    ).toFixed(2) + '%'
                  : 'N/A',
            };
          })
        : [];

    // Transform experiment metadata
    const experimentMetadata = {
      id: experiment.id,
      wsId: experiment.ws_id,
      name: experiment.name,
      description: experiment.description,
      experimentKey: experiment.experiment_key,
      experimentType: experiment.experiment_type,
      status: experiment.status,
      trafficAllocation: experiment.traffic_allocation,
      targetMetric: experiment.target_metric,
      startedAt: experiment.started_at,
      endedAt: experiment.ended_at,
      duration: calculateDuration(experiment.started_at, experiment.ended_at),
      createdAt: experiment.created_at,
      updatedAt: experiment.updated_at,
    };

    return NextResponse.json({
      data: {
        experiment: experimentMetadata,
        summary: {
          totalSessions,
          totalConversions,
          totalVisitors,
          overallConversionRate: Number(overallConversionRate.toFixed(2)),
          bestVariant: bestVariant
            ? {
                id: bestVariant.variantId,
                name: bestVariant.variantName,
                conversionRate: bestVariant.conversionRate,
              }
            : null,
        },
        variants: variantResults,
        statistical: {
          controlVariant: controlVariant
            ? {
                id: controlVariant.variantId,
                name: controlVariant.variantName,
              }
            : null,
          comparisons: statisticalAnalysis,
          sampleSizeAdequate: totalSessions >= 100, // Rule of thumb: 100+ sessions
          recommendation:
            statisticalAnalysis.length > 0
              ? generateRecommendation(
                  statisticalAnalysis,
                  totalSessions,
                  experiment.status
                )
              : 'Insufficient data for statistical analysis',
        },
      },
    });
  },
  {
    permissions: ['view_analytics', 'manage_experiments'],
    requireAll: false,
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);

// Helper function to calculate chi-square statistic
function calculateChiSquare(
  a: number, // Control conversions
  b: number, // Control non-conversions
  c: number, // Variant conversions
  d: number // Variant non-conversions
): number {
  const n = a + b + c + d;
  if (n === 0) return 0;

  const expected_a = ((a + b) * (a + c)) / n;
  const expected_b = ((a + b) * (b + d)) / n;
  const expected_c = ((c + d) * (a + c)) / n;
  const expected_d = ((c + d) * (b + d)) / n;

  if (
    expected_a === 0 ||
    expected_b === 0 ||
    expected_c === 0 ||
    expected_d === 0
  ) {
    return 0;
  }

  const chiSquare =
    Math.pow(a - expected_a, 2) / expected_a +
    Math.pow(b - expected_b, 2) / expected_b +
    Math.pow(c - expected_c, 2) / expected_c +
    Math.pow(d - expected_d, 2) / expected_d;

  return Number(chiSquare.toFixed(4));
}

// Helper function to approximate p-value from chi-square
function chiSquareToPValue(chiSquare: number): number {
  // Approximation for 1 degree of freedom
  // This is a simplified approximation
  if (chiSquare === 0) return 1;
  if (chiSquare > 10.828) return 0.001; // 99.9% confidence
  if (chiSquare > 6.635) return 0.01; // 99% confidence
  if (chiSquare > 3.841) return 0.05; // 95% confidence
  if (chiSquare > 2.706) return 0.1; // 90% confidence

  // Rough linear approximation for values < 2.706
  return Number((1 - chiSquare / 3.841).toFixed(4));
}

// Helper function to calculate experiment duration
function calculateDuration(
  startedAt: string | null,
  endedAt: string | null
): string | null {
  if (!startedAt) return null;

  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Helper function to generate recommendation based on results
function generateRecommendation(
  comparisons: any[],
  totalSessions: number,
  status: string
): string {
  // Check if we have enough data
  if (totalSessions < 100) {
    return 'Continue running experiment - sample size too small for reliable conclusions (need 100+ sessions)';
  }

  // Find variants with significant results
  const significantVariants = comparisons.filter((c) => c.isSignificant);

  if (significantVariants.length === 0) {
    if (status === 'running' && totalSessions < 1000) {
      return 'No statistically significant differences detected yet. Continue running experiment to gather more data.';
    }
    return 'No statistically significant differences detected. Consider stopping experiment or running longer.';
  }

  // Find best significant variant
  const bestSignificant = significantVariants.reduce((best, current) =>
    parseFloat(current.uplift) > parseFloat(best.uplift) ? current : best
  );

  return `${bestSignificant.variantName} shows ${bestSignificant.uplift} uplift with ${bestSignificant.confidence} confidence. Consider implementing this variant.`;
}
