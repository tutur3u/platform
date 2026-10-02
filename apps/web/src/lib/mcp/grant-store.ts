import type { ConsentBinding } from './consent';
import {
  grantSchema,
  McpAccessError,
  type McpAuthority,
  type McpGrant,
} from './contracts';

// Persistent backend contract, not an in-memory production authority. The repo
// has no reviewed MCP grant table/RPC; generic editable user config is unsuitable.
export interface McpGrantStore {
  readCurrent(
    userId: string,
    clientId: string,
    grantId: string
  ): Promise<unknown>;
  // Atomically unique on actor/client/authorization ID. Reuse with a different
  // binding must fail; grant IDs/revisions are store-owned, never user-provided.
  reserve(binding: ConsentBinding): Promise<{ reservationId: string }>;
  // Trusted provider approval activates the reservation once. The token hook
  // reads only active grants and must bind client/resource/grant ID/revision.
  activate(
    reservationId: string,
    expectedBinding: ConsentBinding
  ): Promise<McpGrant>;
  abort(reservationId: string): Promise<void>;
  // Atomic compare-and-swap; revocation increments revision, marks revoked and
  // invalidates associated provider sessions/refresh state before success.
  revoke(
    userId: string,
    clientId: string,
    grantId: string,
    expectedRevision: number
  ): Promise<void>;
}

export function createGrantReader(
  store: Pick<McpGrantStore, 'readCurrent'>
): McpAuthority['readGrant'] {
  return async (userId, clientId, grantId) => {
    const row = await store.readCurrent(userId, clientId, grantId);
    if (row === null || row === undefined) return null;
    const parsed = grantSchema.safeParse(row);
    if (
      !parsed.success ||
      parsed.data.userId !== userId ||
      parsed.data.clientId !== clientId ||
      parsed.data.id !== grantId
    ) {
      throw new McpAccessError(401, 'MCP grant is unavailable.');
    }
    return parsed.data;
  };
}
