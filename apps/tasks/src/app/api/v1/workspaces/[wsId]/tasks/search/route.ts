import { createMeteredTextEmbedding } from '@tuturuuu/ai/embeddings/metered';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { validateRequestBody } from '@/lib/api-middleware';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type Params = { wsId: string };

type SearchMode = 'text' | 'semantic' | 'hybrid';

const TASK_SEARCH_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

const searchTasksBodySchema = z.object({
  matchCount: z
    .number()
    .int()
    .positive()
    .optional()
    .default(50)
    .transform((value) => Math.min(value, 50)),
  matchThreshold: z.number().min(0).max(1).optional().default(0.3),
  mode: z.enum(['text', 'semantic', 'hybrid']).optional().default('hybrid'),
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

export const POST = withSessionAuth<Params>(
  async (req: NextRequest, { supabase, user }, params) => {
    try {
      const bodyResult = await validateRequestBody(req, searchTasksBodySchema);
      if (!('data' in bodyResult)) return bodyResult;

      const { query, matchThreshold, matchCount, mode } = bodyResult.data;
      const wsId = await normalizeWorkspaceId(params.wsId, supabase);

      const membership = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: supabase,
      });

      if (membership.error === 'membership_lookup_failed') {
        serverLogger.error(
          'Failed to verify workspace membership for task search',
          {
            error: membership.error,
            userId: user.id,
            wsId,
          }
        );
        return NextResponse.json(
          { error: 'Failed to verify workspace membership' },
          { status: 500 }
        );
      }

      if (!membership.ok) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }

      const sbAdmin = await createAdminClient();
      let queryEmbedding: string | null = null;
      let searchMode: SearchMode = mode;
      let fallbackReason: string | undefined;

      if (mode !== 'text') {
        const embeddingResult = await createMeteredTextEmbedding({
          metadata: {
            operation: 'task_semantic_search',
          },
          source: 'task_search',
          taskType: 'RETRIEVAL_QUERY',
          userId: user.id,
          value: enhanceSearchQuery(query),
          wsId,
        });

        if (embeddingResult.ok) {
          queryEmbedding = JSON.stringify(embeddingResult.embedding);
        } else if (mode === 'semantic') {
          return NextResponse.json({
            message: 'Task semantic search skipped',
            reason: embeddingResult.reason,
            tasks: [],
          });
        } else {
          fallbackReason = embeddingResult.reason;
          searchMode = 'text';
          serverLogger.warn('Task hybrid search falling back to text search', {
            reason: fallbackReason,
            userId: user.id,
            wsId,
          });
        }
      }

      const { data, error } = await sbAdmin.rpc('match_tasks', {
        query_embedding: queryEmbedding,
        query_text: query,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_ws_id: wsId,
        filter_deleted: false,
        search_mode: searchMode,
      });

      if (error) {
        serverLogger.error('Error searching tasks', {
          error,
          mode: searchMode,
          userId: user.id,
          wsId,
        });
        return NextResponse.json(
          { message: 'Error searching tasks', error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ...(fallbackReason
          ? {
              message: 'Task hybrid search fell back to text search',
              reason: fallbackReason,
            }
          : {}),
        tasks: data ?? [],
      });
    } catch (error) {
      serverLogger.error('Error in task search', error);
      return NextResponse.json(
        {
          message: 'Internal server error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: TASK_SEARCH_APP_SESSION_AUTH,
    rateLimitKind: 'read',
  }
);
