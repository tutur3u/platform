import { MIRA_CHANNEL_KINDS, type MiraChannelKind } from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_PATTERN = /^[0-9a-f]{64}$/;

function assertWorkspaceId(workspaceId: string): void {
  if (!UUID_PATTERN.test(workspaceId)) {
    throw new Error('Invalid workspace id');
  }
}

/**
 * Durable Object names are built only from server-resolved identifiers. The
 * conversation key is a keyed hash (hex SHA-256 HMAC) of the provider account
 * and provider conversation id, so names never carry raw provider ids.
 */
export function tenantObjectName(workspaceId: string): string {
  assertWorkspaceId(workspaceId);
  return `mira:tenant:v1:${workspaceId}`;
}

export function conversationObjectName(args: {
  workspaceId: string;
  channelId: string;
  conversationKey: string;
}): string {
  assertWorkspaceId(args.workspaceId);
  if (!UUID_PATTERN.test(args.channelId)) {
    throw new Error('Invalid channel id');
  }
  if (!KEY_PATTERN.test(args.conversationKey)) {
    throw new Error('Invalid conversation key');
  }
  return `mira:conv:v1:${args.workspaceId}:${args.channelId}:${args.conversationKey}`;
}

/** Input bytes for the keyed conversation hash; the caller supplies the HMAC. */
export function conversationKeyInput(args: {
  channel: MiraChannelKind;
  providerAccountId: string;
  conversationId: string;
}): string {
  if (!MIRA_CHANNEL_KINDS.includes(args.channel)) {
    throw new Error('Invalid channel kind');
  }
  return JSON.stringify([
    'mira-conversation-v1',
    args.channel,
    args.providerAccountId,
    args.conversationId,
  ]);
}

/** Rejects a request whose resolved tenant differs from the stored one. */
export function assertObjectTenant(
  storedWorkspaceId: string | null,
  requestWorkspaceId: string
): string {
  assertWorkspaceId(requestWorkspaceId);
  if (storedWorkspaceId !== null && storedWorkspaceId !== requestWorkspaceId) {
    throw new Error('Tenant mismatch');
  }
  return requestWorkspaceId;
}
