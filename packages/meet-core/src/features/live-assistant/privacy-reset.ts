import 'server-only';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { MemoryCommand } from './memory-command';

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
