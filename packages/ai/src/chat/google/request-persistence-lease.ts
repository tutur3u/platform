import { NextResponse } from 'next/server';

type RpcError = { message: string };

type PrivateRpcClient = {
  schema: (schema: 'private') => {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
  };
};

type PersistenceSource = 'Mira' | 'Rewise';

export type PersistenceLease = {
  leaseToken: string;
  retryAfterSeconds: number;
  state: 'active' | 'claimed' | 'completed';
};

export type ClaimedPersistenceLease = Pick<PersistenceLease, 'leaseToken'> & {
  chatId: string;
  requestId: string;
};

function parseClaimResult(data: unknown, leaseToken: string): PersistenceLease {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid AI persistence lease response');
  }

  const record = data as Record<string, unknown>;
  if (!['active', 'claimed', 'completed'].includes(String(record.state))) {
    throw new Error('Invalid AI persistence lease state');
  }

  const retryAfterSeconds = Number(record.retryAfterSeconds);
  return {
    leaseToken,
    retryAfterSeconds:
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds)
        : 0,
    state: record.state as PersistenceLease['state'],
  };
}

export async function claimAiPersistenceRequest({
  chatId,
  client,
  content,
  creatorId,
  requestId,
  source,
}: {
  chatId: string;
  client: unknown;
  content: string;
  creatorId: string;
  requestId: string;
  source: PersistenceSource;
}): Promise<PersistenceLease> {
  const leaseToken = crypto.randomUUID();
  const { data, error } = await (client as PrivateRpcClient)
    .schema('private')
    .rpc('ai_chat_claim_persistence_request', {
      p_chat_id: chatId,
      p_content: content,
      p_creator_id: creatorId,
      p_lease_token: leaseToken,
      p_request_id: requestId,
      p_source: source,
    });

  if (error) throw new Error(error.message);
  return parseClaimResult(data, leaseToken);
}

export async function beginAiPersistenceRequest({
  chatId,
  client,
  content,
  creatorId,
  requestId,
  source,
}: {
  chatId: string;
  client: unknown;
  content: string;
  creatorId: string;
  requestId?: string;
  source: PersistenceSource;
}): Promise<
  | { lease: ClaimedPersistenceLease; response: null }
  | { lease: null; response: Response | null }
> {
  if (!requestId) return { lease: null, response: null };

  const result = await claimAiPersistenceRequest({
    chatId,
    client,
    content,
    creatorId,
    requestId,
    source,
  });
  if (result.state === 'active') {
    return {
      lease: null,
      response: NextResponse.json(
        {
          code: 'ai_request_in_progress',
          message: 'This AI request is already in progress.',
        },
        {
          headers: {
            'Retry-After': String(Math.max(1, result.retryAfterSeconds)),
          },
          status: 409,
        }
      ),
    };
  }
  if (result.state === 'completed') {
    return {
      lease: null,
      response: NextResponse.json(
        {
          code: 'ai_request_completed',
          message: 'This AI request has already completed.',
        },
        { status: 409 }
      ),
    };
  }

  return {
    lease: { chatId, leaseToken: result.leaseToken, requestId },
    response: null,
  };
}

async function updateAiPersistenceRequest(
  client: unknown,
  rpcName:
    | 'ai_chat_complete_persistence_request'
    | 'ai_chat_release_persistence_request',
  lease: ClaimedPersistenceLease
): Promise<boolean> {
  const { data, error } = await (client as PrivateRpcClient)
    .schema('private')
    .rpc(rpcName, {
      p_chat_id: lease.chatId,
      p_lease_token: lease.leaseToken,
      p_request_id: lease.requestId,
    });

  if (error) throw new Error(error.message);
  return data === true;
}

export function completeAiPersistenceRequest(
  client: unknown,
  lease: ClaimedPersistenceLease
) {
  return updateAiPersistenceRequest(
    client,
    'ai_chat_complete_persistence_request',
    lease
  );
}

export function releaseAiPersistenceRequest(
  client: unknown,
  lease: ClaimedPersistenceLease
) {
  return updateAiPersistenceRequest(
    client,
    'ai_chat_release_persistence_request',
    lease
  );
}

export function createAiPersistenceFinisher<Response>({
  client,
  lease,
  onSettled,
  persist,
}: {
  client: unknown;
  lease: ClaimedPersistenceLease | null;
  onSettled: () => void;
  persist: (response: Response) => Promise<boolean>;
}) {
  let handled = false;

  return async (response: Response): Promise<void> => {
    if (handled) return;
    handled = true;

    try {
      const persisted = await persist(response);
      if (lease && persisted) {
        const completed = await completeAiPersistenceRequest(client, lease);
        if (!completed) {
          throw new Error('Failed to complete AI persistence request lease');
        }
      } else if (lease) {
        await releaseAiPersistenceRequest(client, lease);
      }
      onSettled();
    } catch (error) {
      if (lease) await releaseAiPersistenceRequest(client, lease);
      onSettled();
      throw error;
    }
  };
}
