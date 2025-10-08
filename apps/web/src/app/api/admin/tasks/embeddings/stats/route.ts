import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { NextResponse } from 'next/server';

/**
 * Get statistics about task embeddings across the entire system
 * Only accessible by Tuturuuu admins
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isValidTuturuuuEmail(user.email)) {
      return NextResponse.json(
        { message: 'Unauthorized - Tuturuuu admin access required' },
        { status: 401 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Get total tasks count
    const { count: totalTasks, error: totalError } = await sbAdmin
      .from('tasks')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.error('Error fetching total tasks:', totalError);
      return NextResponse.json(
        {
          message: 'Failed to fetch task statistics',
          error: totalError.message,
        },
        { status: 500 }
      );
    }

    // Get tasks without embeddings count
    const { count: tasksWithoutEmbeddings, error: withoutError } = await sbAdmin
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);

    if (withoutError) {
      console.error('Error fetching tasks without embeddings:', withoutError);
      return NextResponse.json(
        {
          message: 'Failed to fetch task statistics',
          error: withoutError.message,
        },
        { status: 500 }
      );
    }

    // Get tasks with embeddings count
    const tasksWithEmbeddings =
      (totalTasks || 0) - (tasksWithoutEmbeddings || 0);

    // Calculate percentage
    const percentageComplete = totalTasks
      ? ((tasksWithEmbeddings / totalTasks) * 100).toFixed(2)
      : '0';

    return NextResponse.json({
      total: totalTasks || 0,
      withEmbeddings: tasksWithEmbeddings,
      withoutEmbeddings: tasksWithoutEmbeddings || 0,
      percentageComplete: parseFloat(percentageComplete),
    });
  } catch (error) {
    console.error('Error in admin task embeddings stats:', error);
    return NextResponse.json(
      {
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
