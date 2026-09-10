import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import {
  type MemoryCommand,
  memoryCommandSchema,
} from '../../src/features/live-assistant/memory-command';
import { applyMemoryCommand } from './memory-store';
import { LiveDatabaseError, type LiveEnvironment } from './storage';

type Entry = {
  ownerId: string;
  meetingId: string;
  sessionId: string;
  expiresAt: number;
  mode?: 'personal' | 'room';
};
type PendingMemory = { ownerId: string; command: MemoryCommand };
const identitySchema = z.object({
  ownerId: z.uuid(),
  meetingId: z.uuid().optional(),
  sessionId: z.uuid().optional(),
  mode: z.enum(['personal', 'room']).optional(),
  command: memoryCommandSchema.optional(),
});

/** Runs under the owner's serial request queue. Pending writes survive process replacement. */
export async function liveRegistry(
  request: Request,
  storage: DurableObjectStorage,
  env: LiveEnvironment
) {
  const path = new URL(request.url).pathname;
  const parsed = identitySchema.safeParse(await request.json());
  if (!parsed.success) return new Response('Invalid request', { status: 400 });
  const input = parsed.data;
  let entries = (await storage.get<Entry[]>('active')) ?? [];
  if (path === '/registry/remove') {
    await storage.put(
      'active',
      entries.filter((entry) => entry.sessionId !== input.sessionId)
    );
    return Response.json({ ok: true });
  }
  const finishMemory = async (pending: PendingMemory) => {
    if (pending.ownerId !== input.ownerId)
      throw new Error('Memory owner mismatch');
    for (const entry of entries.filter((entry) => entry.mode !== 'room')) {
      const response = await env.MEET_LIVE.get(
        env.MEET_LIVE.idFromName(entry.sessionId)
      ).fetch('https://live.internal/control', {
        method: 'POST',
        body: JSON.stringify({ ...entry, action: 'stop' }),
      });
      if (!response.ok && response.status !== 410)
        throw new Error('Live privacy reset failed');
    }
    let result: { ok: boolean };
    try {
      result = await applyMemoryCommand(env, pending.ownerId, pending.command);
    } catch (error) {
      if (
        !(error instanceof LiveDatabaseError) ||
        ![400, 403, 404, 409].includes(error.status)
      )
        throw error;
      result = { ok: false };
    }
    entries = entries.filter((entry) => entry.mode === 'room');
    await storage.put('active', entries);
    await storage.delete('pending-memory');
    return result;
  };
  const pending = await storage.get<PendingMemory>('pending-memory');
  if (pending) await finishMemory(pending);
  if (path === '/registry/memory' && input.command) {
    const operation = { ownerId: input.ownerId, command: input.command };
    await storage.put('pending-memory', operation);
    return Response.json(await finishMemory(operation));
  }
  const current = entries.filter((entry) => entry.expiresAt > Date.now());
  if (path === '/registry/register' && input.meetingId && input.sessionId) {
    const existing = current.find(
      (entry) => entry.sessionId === input.sessionId
    );
    if (existing) {
      existing.expiresAt = Date.now() + 24 * 60 * 60_000;
      await storage.put('active', current);
      return Response.json({ ok: true });
    }
    if (current.length >= 3)
      return new Response('Stop an existing assistant first', { status: 409 });
    current.push({
      ownerId: input.ownerId,
      meetingId: input.meetingId,
      sessionId: input.sessionId,
      mode: input.mode,
      expiresAt: Date.now() + 24 * 60 * 60_000,
    });
    await storage.put('active', current);
    return Response.json({ ok: true });
  }
  return new Response('Not found', { status: 404 });
}

/** Privacy mutations remain serialized independently of individual session commands. */
export class LiveRegistryQueue {
  private queue = Promise.resolve();
  constructor(
    private storage: DurableObjectStorage,
    private env: LiveEnvironment
  ) {}
  fetch(request: Request) {
    const result = this.queue.then(() =>
      liveRegistry(request, this.storage, this.env)
    );
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
