import { google } from '@ai-sdk/google';
import type { TablesInsert, TablesUpdate } from '@tuturuuu/types';
import { embed } from 'ai';
import {
  MIRA_MEMORY_CATEGORIES,
  type MiraMemoryCategory,
} from '../definitions/memory';
import type { MiraToolContext } from '../mira-tools';

function toMemoryCategory(value: unknown): MiraMemoryCategory | undefined {
  if (typeof value !== 'string') return undefined;
  return MIRA_MEMORY_CATEGORIES.includes(value as MiraMemoryCategory)
    ? (value as MiraMemoryCategory)
    : undefined;
}

function parseMemoryCategory(
  categoryInput: unknown,
  options: { fieldName?: string; required?: boolean } = {}
): { category: MiraMemoryCategory | null; error: string | null } {
  const { fieldName = 'category', required = false } = options;
  const allowed = MIRA_MEMORY_CATEGORIES.join(', ');

  if (categoryInput === undefined || categoryInput === null) {
    if (!required) {
      return { category: null, error: null };
    }

    return {
      category: null,
      error: `${fieldName} is required. Allowed: ${allowed}`,
    };
  }

  const parsedCategory = toMemoryCategory(categoryInput);
  if (!parsedCategory) {
    return {
      category: null,
      error: `Invalid ${fieldName}. Allowed: ${allowed}`,
    };
  }

  return { category: parsedCategory, error: null };
}

const MIRA_MEMORY_EMBEDDING_DIM = 3072;

type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

type MemoryEmbeddingBackfillOptions = {
  category?: MiraMemoryCategory | null;
  maxCandidates?: number;
  maxRegenerations?: number;
};

async function generateEmbedding(text: string, taskType: EmbeddingTaskType) {
  try {
    const { embedding } = await embed({
      model: google.embedding('gemini-embedding-001'),
      value: text,
      providerOptions: {
        google: {
          outputDimensionality: MIRA_MEMORY_EMBEDDING_DIM,
          taskType,
        },
      },
    });
    if (
      !Array.isArray(embedding) ||
      embedding.length !== MIRA_MEMORY_EMBEDDING_DIM
    ) {
      console.error(
        'Invalid memory embedding shape:',
        Array.isArray(embedding) ? embedding.length : typeof embedding
      );
      return null;
    }
    return embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return null;
  }
}

function toMemoryEmbeddingInput(key: string, value: string): string {
  return `${key}: ${value}`;
}

function toStoredEmbedding(embedding: number[] | null): string | null {
  return embedding ? JSON.stringify(embedding) : null;
}

async function regenerateMissingMemoryEmbeddings(
  ctx: MiraToolContext,
  options: MemoryEmbeddingBackfillOptions = {}
): Promise<number> {
  const { category = null, maxCandidates = 20, maxRegenerations = 8 } = options;

  let missingQuery = ctx.supabase
    .from('mira_memories')
    .select('id, key, value')
    .eq('user_id', ctx.userId)
    .is('embedding', null)
    .order('updated_at', { ascending: false })
    .limit(maxCandidates);

  if (category) {
    missingQuery = missingQuery.eq('category', category);
  }

  const { data: missingMemories, error } = await missingQuery;
  if (error) {
    console.error('Failed to load missing memory embeddings:', error);
    return 0;
  }

  if (!missingMemories?.length) {
    return 0;
  }

  let regenerated = 0;
  for (const memory of missingMemories.slice(0, maxRegenerations)) {
    const key = memory.key as string | null;
    const value = memory.value as string | null;
    if (!key || !value) {
      continue;
    }

    const embedding = await generateEmbedding(
      toMemoryEmbeddingInput(key, value),
      'RETRIEVAL_DOCUMENT'
    );
    if (!embedding) {
      continue;
    }

    const { error: updateError } = await ctx.supabase
      .from('mira_memories')
      .update({ embedding: toStoredEmbedding(embedding) })
      .eq('id', memory.id)
      .eq('user_id', ctx.userId);

    if (updateError) {
      console.error(
        'Failed to update regenerated memory embedding:',
        updateError
      );
      continue;
    }

    regenerated += 1;
  }

  return regenerated;
}
export async function executeRemember(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const key = args.key as string;
  const value = args.value as string;
  const { category, error: categoryError } = parseMemoryCategory(
    args.category,
    {
      required: true,
    }
  );

  if (categoryError || !category) {
    return {
      error:
        categoryError ??
        'Invalid category. Allowed: preference, fact, conversation_topic, event, person',
    };
  }

  const { data: existing } = await ctx.supabase
    .from('mira_memories')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('key', key)
    .maybeSingle();

  const combinedText = toMemoryEmbeddingInput(key, value);
  const embedding = await generateEmbedding(combinedText, 'RETRIEVAL_DOCUMENT');

  if (existing) {
    const updatePayload: TablesUpdate<'mira_memories'> = {
      value,
      category,
      embedding: toStoredEmbedding(embedding),
      updated_at: new Date().toISOString(),
      last_referenced_at: new Date().toISOString(),
    };

    const { error } = await ctx.supabase
      .from('mira_memories')
      .update(updatePayload)
      .eq('id', existing.id);

    if (error) return { error: error.message };
    return {
      success: true,
      message: `Memory "${key}" updated`,
      action: 'updated',
    };
  }

  const insertPayload: TablesInsert<'mira_memories'> = {
    user_id: ctx.userId,
    key,
    value,
    category,
    embedding: toStoredEmbedding(embedding),
    source: 'mira_chat',
  };

  const { error } = await ctx.supabase
    .from('mira_memories')
    .insert(insertPayload);

  if (error) return { error: error.message };
  return { success: true, message: `Remembered: "${key}"`, action: 'created' };
}

export async function executeRecall(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const query = (args.query as string | null | undefined) ?? null;
  const { category, error: categoryError } = parseMemoryCategory(args.category);
  if (categoryError) {
    return {
      error: categoryError,
    };
  }
  const maxResults = (args.maxResults as number) || 10;

  let memories: any[] = [];
  let errorMsg: string | null = null;

  if (query?.trim()) {
    // Semantic search using the match_memories RPC
    const embedding = await generateEmbedding(query, 'RETRIEVAL_QUERY');

    if (embedding) {
      const { data, error } = await ctx.supabase.rpc('match_memories', {
        query_embedding: embedding as any,
        match_count: maxResults,
        filter_category: category ?? undefined,
      });

      if (error) {
        errorMsg = error.message;
      } else {
        memories = data || [];
        if (!memories.length) {
          const regenerated = await regenerateMissingMemoryEmbeddings(ctx, {
            category,
          });
          if (regenerated > 0) {
            const { data: retriedData, error: retryError } =
              await ctx.supabase.rpc('match_memories', {
                query_embedding: embedding as any,
                match_count: maxResults,
                filter_category: category ?? undefined,
              });

            if (retryError) {
              errorMsg = retryError.message;
            } else {
              memories = retriedData || [];
            }
          }
        }
      }
    } else {
      // Fallback to text search if embedding generation fails
      let dbQuery = ctx.supabase
        .from('mira_memories')
        .select('key, value, category, updated_at')
        .eq('user_id', ctx.userId)
        .order('updated_at', { ascending: false })
        .limit(maxResults);

      if (category) dbQuery = dbQuery.eq('category', category);

      dbQuery = dbQuery.or(`key.ilike.%${query}%,value.ilike.%${query}%`);

      const { data, error } = await dbQuery;
      if (error) errorMsg = error.message;
      else memories = data || [];
    }
  } else {
    // Standard list fetch without semantic query
    let dbQuery = ctx.supabase
      .from('mira_memories')
      .select('key, value, category, updated_at')
      .eq('user_id', ctx.userId)
      .order('updated_at', { ascending: false })
      .limit(maxResults);

    if (category) dbQuery = dbQuery.eq('category', category);

    const { data, error } = await dbQuery;

    if (error) errorMsg = error.message;
    else memories = data || [];
  }

  if (errorMsg) return { error: errorMsg };

  if (memories?.length) {
    void ctx.supabase
      .from('mira_memories')
      .update({ last_referenced_at: new Date().toISOString() })
      .eq('user_id', ctx.userId)
      .in(
        'key',
        memories.map((m: { key: string }) => m.key)
      );
  }

  return {
    count: memories?.length ?? 0,
    memories: (memories || []).map(
      (m: {
        key: string;
        value: string;
        category: string;
        updated_at: string;
      }) => ({
        key: m.key,
        value: m.value,
        category: m.category,
        updatedAt: m.updated_at,
      })
    ),
  };
}

export async function executeDeleteMemory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const key = args.key as string;

  const { error } = await ctx.supabase
    .from('mira_memories')
    .delete()
    .eq('user_id', ctx.userId)
    .eq('key', key);

  if (error) return { error: error.message };
  return { success: true, message: `Memory "${key}" deleted` };
}

export async function executeListMemories(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { category, error: categoryError } = parseMemoryCategory(args.category);
  if (categoryError) {
    return {
      error: categoryError,
    };
  }

  let dbQuery = ctx.supabase
    .from('mira_memories')
    .select('key, value, category, updated_at')
    .eq('user_id', ctx.userId)
    .order('updated_at', { ascending: false });

  if (category) {
    dbQuery = dbQuery.eq('category', category);
  }

  const { data: memories, error } = await dbQuery;

  if (error) return { error: error.message };

  return {
    count: memories?.length ?? 0,
    memories: (memories || []).map(
      (m: {
        key: string;
        value: string;
        category: string;
        updated_at: string;
      }) => ({
        key: m.key,
        value: m.value,
        category: m.category,
        updatedAt: m.updated_at,
      })
    ),
  };
}

export async function executeMergeMemories(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const keysToDelete = args.keysToDelete as string[];
  const newKey = args.newKey as string;
  const newValue = args.newValue as string;
  const { category: newCategory, error: categoryError } = parseMemoryCategory(
    args.newCategory,
    {
      fieldName: 'newCategory',
      required: true,
    }
  );

  if (categoryError || !newCategory) {
    return {
      error:
        categoryError ??
        'Invalid newCategory. Allowed: preference, fact, conversation_topic, event, person',
    };
  }

  if (!keysToDelete || keysToDelete.length === 0) {
    return { error: 'No keys provided to delete' };
  }

  const combinedText = toMemoryEmbeddingInput(newKey, newValue);
  const embedding = await generateEmbedding(combinedText, 'RETRIEVAL_DOCUMENT');

  // First, insert or update the new combined memory
  const { data: existing } = await ctx.supabase
    .from('mira_memories')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('key', newKey)
    .maybeSingle();

  if (existing) {
    const updatePayload: TablesUpdate<'mira_memories'> = {
      value: newValue,
      category: newCategory,
      embedding: toStoredEmbedding(embedding),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await ctx.supabase
      .from('mira_memories')
      .update(updatePayload)
      .eq('id', existing.id);

    if (updateError) return { error: updateError.message };
  } else {
    const insertPayload: TablesInsert<'mira_memories'> = {
      user_id: ctx.userId,
      key: newKey,
      value: newValue,
      category: newCategory,
      embedding: toStoredEmbedding(embedding),
      source: 'mira_chat',
    };

    const { error: insertError } = await ctx.supabase
      .from('mira_memories')
      .insert(insertPayload);

    if (insertError) return { error: insertError.message };
  }

  // Delete all the old keys (excluding the newKey if it was in the list)
  const keysToRemove = keysToDelete.filter((k) => k !== newKey);

  if (keysToRemove.length > 0) {
    const { error: deleteError } = await ctx.supabase
      .from('mira_memories')
      .delete()
      .eq('user_id', ctx.userId)
      .in('key', keysToRemove);

    if (deleteError) return { error: deleteError.message };
  }

  return {
    success: true,
    message: `Merged ${keysToDelete.length} memories into "${newKey}"`,
  };
}
