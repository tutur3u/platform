/**
 * Analytics Data Cleanup Cron Job
 * Runs daily to clean up old analytics data and optimize storage
 *
 * - Deletes session data older than retention period (default 90 days)
 * - Removes events older than retention period
 * - Cleans up variant assignments for archived experiments
 * - Removes orphaned records
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
    // Default retention period: 90 days
    const defaultRetentionDays = 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - defaultRetentionDays);
    const cutoffISOString = cutoffDate.toISOString();

    const cleanupResults = {
      sessions_deleted: 0,
      events_deleted: 0,
      variant_assignments_deleted: 0,
      conversions_deleted: 0,
    };

    // 1. Delete old sessions (CASCADE will handle related events)
    // Note: Check workspace-specific retention settings if available
    const { count: sessionsDeleted, error: sessionsError } = await supabase
      .from('analytics_sessions')
      .delete({ count: 'exact' })
      .lt('started_at', cutoffISOString);

    if (sessionsError) {
      console.error('Error deleting old sessions:', sessionsError);
    } else {
      cleanupResults.sessions_deleted = sessionsDeleted || 0;
    }

    // 2. Delete old events not associated with sessions
    // Events are typically cascade deleted with sessions, but clean up orphaned ones
    const { count: eventsDeleted, error: eventsError } = await supabase
      .from('analytics_events')
      .delete({ count: 'exact' })
      .lt('timestamp', cutoffISOString)
      .is('session_id', null);

    if (eventsError) {
      console.error('Error deleting orphaned events:', eventsError);
    } else {
      cleanupResults.events_deleted = eventsDeleted || 0;
    }

    // 3. Clean up variant assignments for archived experiments older than 180 days
    const archiveCutoff = new Date();
    archiveCutoff.setDate(archiveCutoff.getDate() - 180);
    const archiveCutoffISO = archiveCutoff.toISOString();

    // Get archived experiment IDs
    const { data: archivedExperiments, error: archivedError } = await supabase
      .from('analytics_experiments')
      .select('id')
      .eq('status', 'archived')
      .lt('ended_at', archiveCutoffISO);

    if (!archivedError && archivedExperiments && archivedExperiments.length > 0) {
      const archivedIds = archivedExperiments.map((exp) => exp.id);

      const { count: assignmentsDeleted, error: assignmentsError } =
        await supabase
          .from('analytics_variant_assignments')
          .delete({ count: 'exact' })
          .in('experiment_id', archivedIds);

      if (assignmentsError) {
        console.error('Error deleting variant assignments:', assignmentsError);
      } else {
        cleanupResults.variant_assignments_deleted = assignmentsDeleted || 0;
      }
    }

    // 4. Delete old conversions
    const { count: conversionsDeleted, error: conversionsError } = await supabase
      .from('analytics_conversions')
      .delete({ count: 'exact' })
      .lt('converted_at', cutoffISOString);

    if (conversionsError) {
      console.error('Error deleting old conversions:', conversionsError);
    } else {
      cleanupResults.conversions_deleted = conversionsDeleted || 0;
    }

    // 5. Vacuum analyze to reclaim storage (optional, requires superuser)
    // This would be done directly on the database if needed:
    // VACUUM ANALYZE analytics_sessions, analytics_events, analytics_variant_assignments;

    const totalDeleted =
      cleanupResults.sessions_deleted +
      cleanupResults.events_deleted +
      cleanupResults.variant_assignments_deleted +
      cleanupResults.conversions_deleted;

    return NextResponse.json({
      ok: true,
      message: 'Analytics data cleanup completed',
      cleaned_at: new Date().toISOString(),
      retention_days: defaultRetentionDays,
      cutoff_date: cutoffISOString,
      results: cleanupResults,
      total_deleted: totalDeleted,
    });
  } catch (error) {
    console.error('Error in cleanup-data cron:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
