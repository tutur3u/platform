import type {
  DurableObjectNamespace,
  DurableObjectStorage,
} from '@cloudflare/workers-types';
import type { LiveContextTurn } from '../../src/features/live-assistant/context';
import type {
  LiveMemory,
  LiveSessionClaims,
} from '../../src/features/live-assistant/contracts';
import { liveMemorySchema } from '../../src/features/live-assistant/contracts';

export interface LiveEnvironment {
  MEET_LIVE: DurableObjectNamespace;
  MEET_REALTIME_TOKEN_SECRET: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
  MEET_REALTIME_URL: string;
}
export class LiveDatabaseError extends Error {
  constructor(readonly status: number) {
    super(`live_database_${status}`);
  }
}

/** All calls are server-only. Never include response bodies in runtime logs. */
export async function liveDatabase<T>(
  env: LiveEnvironment,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
    schema?: 'public' | 'private';
    prefer?: string;
  }
): Promise<T> {
  const response = await fetch(
    new URL(`/rest/v1/${path}`, env.NEXT_PUBLIC_SUPABASE_URL),
    {
      method: init?.method ?? 'GET',
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': init?.schema ?? 'public',
        'Accept-Profile': init?.schema ?? 'public',
        ...(init?.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!response.ok) throw new LiveDatabaseError(response.status);
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export async function readLiveMemory(
  env: LiveEnvironment,
  claims: LiveSessionClaims
) {
  if (claims.mode !== 'personal')
    return { enabled: false, memories: [] as LiveMemory[] };
  const preferences = await liveDatabase<Array<{ memory_enabled: boolean }>>(
    env,
    `meet_ai_user_preferences?user_id=eq.${claims.ownerId}&select=memory_enabled`
  );
  if (preferences[0]?.memory_enabled !== true)
    return { enabled: false, memories: [] as LiveMemory[] };
  const memories = await liveDatabase<unknown[]>(
    env,
    `meet_ai_memories?user_id=eq.${claims.ownerId}&select=id,content,category,created_at&limit=100`
  );
  return {
    enabled: true,
    memories: memories.map((item) => liveMemorySchema.parse(item)),
  };
}

/** Sequential archive keys support bounded paging without loading the entire call. */
export class LiveTurnArchive {
  constructor(private readonly storage: DurableObjectStorage) {}
  async append(turn: LiveContextTurn) {
    await this.storage.transaction(async (txn) => {
      const sequence = ((await txn.get<number>('archive:sequence')) ?? 0) + 1;
      await txn.put(`turn:${String(sequence).padStart(12, '0')}`, turn);
      await txn.put('archive:sequence', sequence);
    });
  }
  async search(query: string, before?: string) {
    const terms = query
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8);
    const page = await this.storage.list<LiveContextTurn>({
      prefix: 'turn:',
      reverse: true,
      limit: 200,
      ...(before ? { end: before } : {}),
    });
    const matches = [...page].filter(([, turn]) =>
      terms.every((term) => turn.text.toLocaleLowerCase().includes(term))
    );
    return {
      turns: matches
        .slice(0, 12)
        .map(([cursor, turn]) => ({ cursor, ...turn })),
      nextCursor: page.size === 200 ? [...page.keys()].at(-1) : null,
    };
  }
}
