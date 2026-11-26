import { createHmac } from 'node:crypto';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '@tuturuuu/realtime/core/token';
import { networkSubject } from '@tuturuuu/utils/network-subject';
import { z } from 'zod';
import { matchesGuestWork } from '../lib/guest-event-work';

const ticketSchema = z.object({
  scope: z.literal('meet-event-work-v1'),
  id: z.uuid(),
  meetingId: z.uuid(),
  eventExpiresAt: z.number().int(),
  expiresAt: z.number().int(),
  binding: z.string(),
  difficulty: z.union([z.literal(19), z.literal(20), z.literal(22)]),
});

type TicketContext = {
  meetingId: string;
  eventExpiresAt: number;
  network: string | undefined;
  displayName: string;
};

function workKey(secret: string, purpose: 'ticket' | 'binding') {
  return createHmac('sha256', secret.trim())
    .update(`meet-event-work:v1:${purpose}`)
    .digest('base64url');
}

function binding(context: TicketContext, secret: string) {
  return createHmac('sha256', workKey(secret, 'binding'))
    .update(
      JSON.stringify([
        networkSubject(context.network ?? 'unknown'),
        context.displayName,
      ])
    )
    .digest('base64url');
}

export function issueMeetGuestWork(
  context: TicketContext,
  difficulty: z.infer<typeof ticketSchema>['difficulty'],
  secret: string,
  now = Date.now()
) {
  const expiresAt = Math.min(
    context.eventExpiresAt,
    now + (difficulty === 22 ? 300_000 : 120_000)
  );
  const ticket = signRealtimePayload(
    {
      scope: 'meet-event-work-v1',
      id: crypto.randomUUID(),
      meetingId: context.meetingId,
      eventExpiresAt: context.eventExpiresAt,
      expiresAt,
      binding: binding(context, secret),
      difficulty,
    },
    workKey(secret, 'ticket')
  );
  return { ticket, difficulty, expiresAt };
}

export async function redeemMeetGuestWork(
  context: TicketContext,
  work: { ticket: string; nonce: number },
  secret: string,
  consume: (id: string, ttlMs: number) => Promise<boolean>,
  now = Date.now,
  minimumDifficulty = 19
) {
  const parsed = ticketSchema.safeParse(
    verifyRealtimePayload(work.ticket, workKey(secret, 'ticket'))
  );
  if (!parsed.success) return null;
  const ticket = parsed.data;
  if (
    ticket.meetingId !== context.meetingId ||
    ticket.eventExpiresAt !== context.eventExpiresAt ||
    ticket.binding !== binding(context, secret) ||
    ticket.difficulty < minimumDifficulty ||
    ticket.expiresAt <= now() ||
    !(await matchesGuestWork(work.ticket, work.nonce, ticket.difficulty))
  )
    return null;
  const ttlMs = ticket.expiresAt - now();
  if (ttlMs <= 0 || !(await consume(ticket.id, ttlMs + 60_000))) return null;
  return ticket.id;
}
