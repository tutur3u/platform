import { z } from 'zod';
import type { PeopleIngressEvent } from './ingress-event';
import { lookupHash, PEOPLE_KEY_PURPOSES, unwrapWorkspaceKey } from './keys';
import type { PeoplePrincipal, PeoplePrincipalRpc } from './request-signature';

// Hashes the signed sender and conversation under every retained lookup key
// version, so raw provider identifiers never reach the database. Throws
// InvalidExternalIdError for an identifier that cannot be normalised.

const keysSchema = z.array(
  z.object({
    purpose: z.enum(PEOPLE_KEY_PURPOSES),
    version: z.number().int().positive(),
    wrappedKey: z.string(),
    current: z.boolean(),
  })
);

export type PeopleLookup = { version: number; hash: string };

export type PeopleEvidenceLookups = {
  sender: PeopleLookup[];
  conversation: PeopleLookup[];
  senderCurrent: PeopleLookup;
  conversationCurrent: PeopleLookup;
};

export async function deriveEvidenceLookups(
  rpc: PeoplePrincipalRpc,
  principal: PeoplePrincipal,
  evidence: PeopleIngressEvent
): Promise<PeopleEvidenceLookups | null> {
  const loaded = await rpc('people_machine_lookup_keys', {
    p_ws: principal.wsId,
    p_principal: principal.principalId,
  });
  const wrapped = keysSchema.safeParse(loaded.data);
  if (loaded.error || !wrapped.success) return null;
  const hashes = (
    purpose: 'sender_lookup' | 'conversation_lookup',
    externalId: string
  ) =>
    wrapped.data
      .filter((key) => key.purpose === purpose)
      .map((key) => ({
        version: key.version,
        current: key.current,
        hash: lookupHash(unwrapWorkspaceKey(principal.wsId, key), {
          wsId: principal.wsId,
          channel: evidence.channel,
          account: evidence.account,
          externalId,
        }).toString('hex'),
      }));
  const sender = hashes('sender_lookup', evidence.sender);
  const conversation = hashes('conversation_lookup', evidence.conversation);
  const senderCurrent = sender.find((entry) => entry.current);
  const current = conversation.find((entry) => entry.current);
  if (!senderCurrent || !current) return null;
  const strip = ({ version, hash }: PeopleLookup) => ({ version, hash });
  return {
    sender: sender.map(strip),
    conversation: conversation.map(strip),
    senderCurrent: strip(senderCurrent),
    conversationCurrent: strip(current),
  };
}
