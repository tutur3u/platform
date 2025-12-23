import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { embed } from 'ai';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

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

export async function POST(req: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId } = await params;

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get search query from request body
    const body = await req.json();
    const { query, matchThreshold = 0.3, matchCount = 50 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { message: 'Query is required' },
        { status: 400 }
      );
    }

    // Enhance query with context for better semantic matching
    const enhancedQuery = enhanceSearchQuery(query.trim());

    // Generate embedding for search query using Google Gemini
    // Use RETRIEVAL_QUERY task type to match RETRIEVAL_DOCUMENT
    const { embedding } = await embed({
      model: google.embeddingModel('gemini-embedding-001'),
      value: enhancedQuery,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_QUERY', // Optimized for querying documents
        },
      },
    });

    // Call the hybrid match_tasks function with both embedding and text
    const { data, error } = await supabase.rpc('match_tasks', {
      query_embedding: JSON.stringify(embedding),
      query_text: query.trim(), // Pass original query for full-text search
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
