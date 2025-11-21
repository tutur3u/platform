/**
 * Process Experiments Cron Job
 * Runs hourly to process experiment data and update variant assignment counts
 *
 * Triggered by Vercel Cron
 */

import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createClient();

  try {
    // Get all running experiments
    const { data: experiments, error: experimentsError } = await supabase
      .from('analytics_experiments')
      .select('id, ws_id, target_metric')
      .eq('status', 'running');

    if (experimentsError) {
      console.error('Error fetching running experiments:', experimentsError);
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to fetch experiments',
        },
        { status: 500 }
      );
    }

    let processedCount = 0;
    const errors: string[] = [];

    // Process each experiment
    for (const experiment of experiments || []) {
      try {
        // Call RPC function to update experiment statistics
        // This recalculates variant assignment counts and conversion metrics
        const { error: processError } = await supabase.rpc(
          'process_experiment_statistics',
          {
            p_experiment_id: experiment.id,
          }
        );

        if (processError) {
          console.error(
            `Error processing experiment ${experiment.id}:`,
            processError
          );
          errors.push(`Experiment ${experiment.id}: ${processError.message}`);
        } else {
          processedCount++;
        }
      } catch (error) {
        console.error(`Exception processing experiment ${experiment.id}:`, error);
        errors.push(
          `Experiment ${experiment.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Experiment processing completed',
      processed_at: new Date().toISOString(),
      total_experiments: experiments?.length || 0,
      processed_count: processedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error in process-experiments cron:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
