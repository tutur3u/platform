import { expect, it, vi } from 'vitest';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import {
  controlWorkspaceReview,
  expireWorkspaceReviews,
} from '../../../cloudflare/live/workspace-review';

function fixture() {
  const saved = {
    claims: { ownerId: 'owner', meetingId: 'room', mode: 'personal' },
    workspace: { id: 'workspace' },
    reviews: [
      {
        id: 'review',
        name: 'workspace_tool',
        status: 'pending',
        expiresAt: Date.now() + 60000,
        callId: 'call',
        toolName: 'workspace_create_task',
        args: { name: 'Task' },
      },
    ],
  } as unknown as SavedSession;
  const persist = vi.fn(async () => {});
  const emit = vi.fn();
  const respond = vi.fn();
  const provider = { sendToolResponse: respond } as unknown as Parameters<
    typeof controlWorkspaceReview
  >[2];
  const command = (action: 'claim' | 'deny' | 'finish', ownerId = 'owner') =>
    controlWorkspaceReview(
      {
        ownerId,
        meetingId: 'room',
        reviewId: 'review',
        action,
        result: 'done',
      },
      saved,
      provider,
      persist,
      emit
    );
  return { saved, command, respond, persist };
}
it('rejects another requester and all room-wide private-tool execution', async () => {
  const f = fixture();
  expect((await f.command('claim', 'guest')).status).toBe(403);
  f.saved.claims.mode = 'room';
  expect((await f.command('claim')).status).toBe(403);
  expect(f.persist).not.toHaveBeenCalled();
});
it('claims once before execution and never retries an already completed or denied review', async () => {
  const f = fixture();
  expect((await f.command('claim')).ok).toBe(true);
  expect((await f.command('claim')).status).toBe(409);
  expect((await f.command('finish')).ok).toBe(true);
  expect((await f.command('finish')).status).toBe(409);
  expect(f.respond).toHaveBeenCalledOnce();
  const denied = fixture();
  await denied.command('deny');
  expect((await denied.command('claim')).status).toBe(409);
});
it('does not return private results after the session ends', async () => {
  const f = fixture();
  await f.command('claim');
  f.saved.ended = true;
  expect((await f.command('finish')).status).toBe(403);
  expect(f.respond).not.toHaveBeenCalled();
});

it('expires an abandoned claim without making the mutation retryable', async () => {
  const f = fixture();
  await f.command('claim');
  f.saved.reviews[0]!.processingAt = Date.now() - 120001;
  await expireWorkspaceReviews(f.saved, undefined, f.persist, vi.fn());
  expect(f.saved.reviews[0]?.status).toBe('failed');
  expect((await f.command('claim')).status).toBe(409);
  expect((await f.command('finish')).status).toBe(409);
  expect(f.saved.toolResponses?.[0]?.response.error).toContain('Do not retry');
  expect((await f.command('deny')).ok).toBe(true);
  expect(f.saved.reviews).toHaveLength(0);
  expect((await f.command('claim')).status).not.toBe(200);
});
