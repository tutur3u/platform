import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PeopleIngressEvent } from './ingress-event';
import {
  displayBinding,
  encryptDisplay,
  PEOPLE_KEY_PURPOSES,
  suppressionToken,
  unwrapWorkspaceKey,
} from './keys';
import type { PeopleEvidenceLookups } from './machine-lookups';
import type { PeoplePrincipal, PeoplePrincipalRpc } from './request-signature';

// Capture material for proposing an unknown sender. The database returns the
// suppression and display keys only while capture is on; without them there
// is nothing to propose. The suppression token covers every retained lookup
// and suppression version, so a later deletion fences the proposal.

const keysSchema = z.array(
  z.object({
    purpose: z.enum(PEOPLE_KEY_PURPOSES),
    version: z.number().int().positive(),
    wrappedKey: z.string(),
    current: z.boolean(),
  })
);

export type PeopleCaptureMaterial = {
  personId: string;
  lookup: { version: number; hash: string };
  suppression: { version: number; token: string };
  checks: string[];
  display: string;
};

export async function deriveCaptureMaterial(
  rpc: PeoplePrincipalRpc,
  principal: PeoplePrincipal,
  evidence: PeopleIngressEvent,
  lookups: PeopleEvidenceLookups
): Promise<PeopleCaptureMaterial | null> {
  const loaded = await rpc('people_machine_capture_keys', {
    p_ws: principal.wsId,
    p_principal: principal.principalId,
  });
  const wrapped = keysSchema.safeParse(loaded.data);
  if (loaded.error || !wrapped.success) return null;
  const keys = wrapped.data.map((key) => ({
    current: key.current,
    key: unwrapWorkspaceKey(principal.wsId, key),
  }));
  const suppression = keys.filter(({ key }) => key.purpose === 'suppression');
  const current = suppression.find((entry) => entry.current)?.key;
  const display = keys.find(
    ({ key, current: live }) => key.purpose === 'display' && live
  )?.key;
  if (!current || !display) return null;

  const lookup = Buffer.from(lookups.senderCurrent.hash, 'hex');
  const personId = randomUUID();
  return {
    personId,
    lookup: lookups.senderCurrent,
    suppression: {
      version: current.version,
      token: suppressionToken(current, principal.wsId, lookup).toString('hex'),
    },
    checks: lookups.sender.flatMap((entry) =>
      suppression.map(({ key }) =>
        suppressionToken(
          key,
          principal.wsId,
          Buffer.from(entry.hash, 'hex')
        ).toString('hex')
      )
    ),
    display: encryptDisplay(
      display,
      principal.wsId,
      displayBinding(personId, evidence.channel, evidence.account),
      evidence.sender
    ).toString('hex'),
  };
}
