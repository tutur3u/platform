import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { identityKey } from './registry-codec';
import { AI_AGENT_IDENTITY_PREFIX, type AiAgentIdentityLink } from './types';
import {
  getRootSecretValue,
  readSecretRows,
  replaceSecretRows,
} from './workspace-secret-store';

export async function listZaloIdentityLinks(db?: TypedSupabaseClient) {
  const rows = await readSecretRows({ db, prefix: AI_AGENT_IDENTITY_PREFIX });

  return rows.flatMap((row): AiAgentIdentityLink[] => {
    const [prefix, workspaceId, provider, providerAccountId, externalUserId] =
      row.name.split(':');

    if (
      prefix !== AI_AGENT_IDENTITY_PREFIX ||
      provider !== 'zalo' ||
      !workspaceId ||
      !providerAccountId ||
      !externalUserId ||
      !row.value
    ) {
      return [];
    }

    return [
      {
        externalUserId,
        platformUserId: row.value,
        provider,
        providerAccountId,
        workspaceId,
      },
    ];
  });
}

export async function saveZaloIdentityLink({
  db,
  link,
}: {
  db?: TypedSupabaseClient;
  link: AiAgentIdentityLink;
}) {
  await replaceSecretRows({
    db,
    names: [identityKey(link)],
    rows: [{ name: identityKey(link), value: link.platformUserId }],
  });

  return link;
}

export async function resolveZaloIdentity({
  db,
  externalUserId,
  providerAccountId,
  workspaceId,
}: {
  db?: TypedSupabaseClient;
  externalUserId: string;
  providerAccountId: string;
  workspaceId: string;
}) {
  const value = await getRootSecretValue(
    `${AI_AGENT_IDENTITY_PREFIX}:${workspaceId}:zalo:${providerAccountId}:${externalUserId}`,
    db
  );

  return value;
}
