import { createMeteredTextEmbedding } from '@tuturuuu/ai/embeddings/metered';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateRequestBody } from '@/lib/api-middleware';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const searchTasksBodySchema = z.object({
  matchCount: z
    .number()
    .int()
    .positive()
    .optional()
    .default(50)
    .transform((value) => Math.min(value, 50)),
  matchThreshold: z.number().min(0).max(1).optional().default(0.3),
  query: z.string().trim().min(1),
});

/**
 * Enhance search query with context and expanded terms
 */
function enhanceSearchQuery(query: string): string {
  // Expand common abbreviations and add context
  const expansions: Record<string, string> = {
    // Priority terms
    urgent: 'urgent important high priority critical',
    important: 'important high priority urgent',
    critical: 'critical urgent highest priority',

    // Status terms
    todo: 'todo task pending not started',
    done: 'done completed finished',
    wip: 'work in progress ongoing active',

    // Time-related
    today: 'today due now',
    tomorrow: 'tomorrow upcoming soon',
    overdue: 'overdue late delayed',

    // Common actions
    fix: 'fix bug error issue problem',
    bug: 'bug error issue defect problem',
    feature: 'feature enhancement improvement',
    update: 'update change modify',
    implement: 'implement create add build develop',
  };

  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/);

  // Collect all expanded terms
  const expandedTerms = new Set<string>([query]); // Always include original

  words.forEach((word) => {
    // Check for exact matches
    if (expansions[word]) {
      expansions[word].split(' ').forEach((term) => {
        expandedTerms.add(term);
      });
    }

    // Check for partial matches
    Object.entries(expansions).forEach(([key, value]) => {
      if (word.includes(key) || key.includes(word)) {
        expandedTerms.add(value);
      }
    });
  });

  return Array.from(expandedTerms).join(' ');
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient(req);
    const { wsId: id } = await params;

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error(
        'Error verifying workspace membership for task search:',
        membership.error
      );
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const bodyResult = await validateRequestBody(req, searchTasksBodySchema);
    if (!('data' in bodyResult)) return bodyResult;

    const { query, matchThreshold, matchCount } = bodyResult.data;

    const sbAdmin = await createAdminClient();

    // Enhance query with context for better semantic matching
    const enhancedQuery = enhanceSearchQuery(query);

    const embeddingResult = await createMeteredTextEmbedding({
      metadata: {
        operation: 'task_semantic_search',
      },
      source: 'task_search',
      taskType: 'RETRIEVAL_QUERY',
      userId: user.id,
      value: enhancedQuery,
      wsId,
    });

    if (!embeddingResult.ok) {
      return NextResponse.json({
        message: 'Task semantic search skipped',
        reason: embeddingResult.reason,
        tasks: [],
      });
    }

    // Call the hybrid match_tasks function with both embedding and text
    const { data, error } = await sbAdmin.rpc('match_tasks', {
      query_embedding: JSON.stringify(embeddingResult.embedding),
      query_text: query, // Pass original query for full-text search
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_ws_id: wsId,
      filter_deleted: false,
    });

    if (error) {
      console.error('Error searching tasks:', error);
      return NextResponse.json(
        { message: 'Error searching tasks', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ tasks: data });
  } catch (error) {
    console.error('Error in semantic search:', error);
    return NextResponse.json(
      {
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
