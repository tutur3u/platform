import 'server-only';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { MemoryCommand } from './memory-command';

export { withdrawMiraAccount } from './server/account-confirmation';

/**
 * After a withdrawn Mira confirmation, ends every Private Mira session of the
 * owner and revokes the tutor chat each one could read. Best effort and
 * bounded: a failure is logged, and each later read also needs a confirmed
 * account.
 */
export async function withdrawPrivateLiveSessions(ownerId: string) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const objects = (env as unknown as { MEET_LIVE?: DurableObjectNamespace })
      .MEET_LIVE;
    if (!objects) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = await Promise.race([
      objects
        .get(objects.idFromName(`owner:${ownerId}`))
        .fetch('https://live.internal/registry/withdraw', {
          method: 'POST',
          body: JSON.stringify({ ownerId }),
        }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Deadline exceeded')),
          10_000
        );
      }),
    ]).finally(() => clearTimeout(timer));
    if (!response.ok) throw new Error(`registry_${response.status}`);
  } catch {
    console.warn('Private Mira sessions could not be ended on withdrawal');
  }
}

export async function mutatePrivateLiveMemory(
  ownerId: string,
  command: MemoryCommand
) {
  const { env } = await getCloudflareContext({ async: true });
  const objects = (env as unknown as { MEET_LIVE?: DurableObjectNamespace })
    .MEET_LIVE;
  if (!objects) throw new Error('Memory coordination is unavailable');
  const response = await objects
    .get(objects.idFromName(`owner:${ownerId}`))
    .fetch('https://live.internal/registry/memory', {
      method: 'POST',
      body: JSON.stringify({ ownerId, command }),
    });
  if (!response.ok) throw new Error('Could not update private memory');
  return (await response.json()) as { ok: boolean };
}
