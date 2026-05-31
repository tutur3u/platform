import {
  forgetAiMemory,
  listAiMemories,
  rememberAiMemory,
  resolveAiMemoryScope,
  searchAiMemories,
} from '../../memory';
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
    if (!required) return { category: null, error: null };
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

function getMemoryWorkspaceId(ctx: MiraToolContext) {
  return ctx.workspaceContext?.wsId ?? ctx.wsId;
}

function resolveMiraMemoryScope(ctx: MiraToolContext) {
  return resolveAiMemoryScope({
    customId: ctx.chatId ?? 'mira-chat',
    product: 'mira',
    source: 'mira_chat',
    surface: 'mira_chat',
    userId: ctx.userId,
    wsId: getMemoryWorkspaceId(ctx),
  });
}

function keyValueMemory(memory: {
  category?: string | null;
  key?: string | null;
  updatedAt?: string | null;
  value: string;
}) {
  return {
    category: memory.category ?? 'fact',
    key: memory.key ?? memory.value.slice(0, 80),
    updatedAt: memory.updatedAt ?? new Date().toISOString(),
    value: memory.value,
  };
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

  const result = await rememberAiMemory({
    category,
    key,
    scope: resolveMiraMemoryScope(ctx),
    value,
  });

  if (!result.ok) return { error: result.error };
  if (result.skipped) {
    return {
      action: 'skipped',
      message: `Memory "${key}" was not saved: ${result.reason}`,
      success: false,
    };
  }

  return {
    action: 'created',
    message: `Remembered: "${key}"`,
    success: true,
  };
}

export async function executeRecall(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const query = (args.query as string | null | undefined) ?? null;
  const { category, error: categoryError } = parseMemoryCategory(args.category);
  if (categoryError) return { error: categoryError };

  const maxResults = (args.maxResults as number) || 10;
  const scope = resolveMiraMemoryScope(ctx);

  const result = query?.trim()
    ? await searchAiMemories({
        category,
        limit: maxResults,
        query,
        scope,
      })
    : await listAiMemories({
        category,
        limit: maxResults,
        scope,
      });

  if (!result.ok) return { error: result.error };

  const memories = (result.value ?? []).map((memory) =>
    keyValueMemory({
      category:
        'category' in memory
          ? memory.category
          : typeof memory.metadata?.memoryCategory === 'string'
            ? memory.metadata.memoryCategory
            : category,
      key:
        'key' in memory
          ? memory.key
          : typeof memory.metadata?.memoryKey === 'string'
            ? memory.metadata.memoryKey
            : null,
      updatedAt: memory.updatedAt,
      value:
        'value' in memory
          ? memory.value
          : memory.summary || memory.content || memory.title || '',
    })
  );

  return {
    count: memories.length,
    memories,
  };
}

export async function executeDeleteMemory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const key = args.key as string;
  const result = await forgetAiMemory({
    key,
    scope: resolveMiraMemoryScope(ctx),
  });

  if (!result.ok) return { error: result.error };
  if (result.skipped) {
    return {
      message: `Memory "${key}" was not deleted: ${result.reason}`,
      success: false,
    };
  }

  return { message: `Memory "${key}" deleted`, success: true };
}

export async function executeListMemories(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { category, error: categoryError } = parseMemoryCategory(args.category);
  if (categoryError) return { error: categoryError };

  const result = await listAiMemories({
    category,
    scope: resolveMiraMemoryScope(ctx),
  });

  if (!result.ok) return { error: result.error };

  const memories = (result.value ?? []).map((memory) =>
    keyValueMemory({
      category: memory.category,
      key: memory.key,
      updatedAt: memory.updatedAt,
      value: memory.summary || memory.content || memory.title || '',
    })
  );

  return {
    count: memories.length,
    memories,
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

  const scope = resolveMiraMemoryScope(ctx);
  const rememberResult = await rememberAiMemory({
    category: newCategory,
    key: newKey,
    scope,
    value: newValue,
  });

  if (!rememberResult.ok) return { error: rememberResult.error };

  await Promise.all(
    keysToDelete
      .filter((key) => key !== newKey)
      .map((key) =>
        forgetAiMemory({
          key,
          reason: `Merged into ${newKey}`,
          scope,
        })
      )
  );

  return {
    message: `Merged ${keysToDelete.length} memories into "${newKey}"`,
    success: !rememberResult.skipped,
  };
}
