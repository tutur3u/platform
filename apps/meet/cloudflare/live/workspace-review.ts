import type { Session } from '@google/genai/web';
import type { LiveAssistantEvent } from '../../src/features/live-assistant/contracts';
import { dismissFailedLiveReview, liveReviewEvent } from './reviews';
import type { SavedSession } from './session-state';
import { queueLiveToolResponse } from './tool-responses';

/** Only internal Worker routes can reach this endpoint; browser commands cannot submit results. */
export async function controlWorkspaceReview(
  input: {
    ownerId: string;
    meetingId: string;
    reviewId: string;
    action: 'claim' | 'deny' | 'finish';
    result?: string;
    failed?: boolean;
  },
  saved: SavedSession | undefined,
  provider: Session | undefined,
  persist: () => Promise<void>,
  emit: (event: LiveAssistantEvent) => void
) {
  if (
    !saved ||
    saved.ended ||
    saved.claims.mode !== 'personal' ||
    input.ownerId !== saved.claims.ownerId ||
    input.meetingId !== saved.claims.meetingId
  )
    return new Response('Forbidden', { status: 403 });
  const review = saved.reviews.find(
    (item) => item.id === input.reviewId && item.name === 'workspace_tool'
  );
  if (!review || !saved.workspace)
    return new Response('Review unavailable', { status: 404 });
  if (
    input.action === 'deny' &&
    (await dismissFailedLiveReview(saved, input.reviewId, persist))
  )
    return Response.json({ ok: true });
  if (input.action === 'finish') {
    if (review.status !== 'processing')
      return new Response('Review already handled', { status: 409 });
    review.status = input.failed ? 'failed' : 'approved';
    await persist();
    await queueLiveToolResponse(
      saved,
      provider,
      {
        id: review.callId,
        name: review.toolName!,
        response: {
          result: input.result?.slice(0, 48000),
          failed: input.failed === true,
        },
      },
      persist
    );
    emit(liveReviewEvent(review));
    return Response.json({ ok: true });
  }
  if (
    review.status !== 'pending' ||
    (input.action === 'claim' && review.expiresAt < Date.now())
  )
    return new Response('Review expired or already handled', { status: 409 });
  review.status = input.action === 'claim' ? 'processing' : 'denied';
  if (input.action === 'claim') review.processingAt = Date.now();
  await persist();
  emit(liveReviewEvent(review));
  if (input.action === 'deny') {
    await queueLiveToolResponse(
      saved,
      provider,
      {
        id: review.callId,
        name: review.toolName!,
        response: { approved: false, error: 'User declined. Do not retry.' },
      },
      persist
    );
    return Response.json({ ok: true });
  }
  return Response.json({
    workspaceId: saved.workspace.id,
    timezone: saved.timezone,
    toolName: review.toolName?.replace(/^workspace_/, ''),
    args: review.args,
  });
}

export async function expireWorkspaceReviews(
  saved: SavedSession,
  provider: Session | undefined,
  persist: () => Promise<void>,
  emit: (event: LiveAssistantEvent) => void
) {
  for (const review of saved.reviews) {
    if (
      review.name !== 'workspace_tool' ||
      review.status !== 'processing' ||
      Date.now() - (review.processingAt ?? 0) < 120000
    )
      continue;
    review.status = 'failed';
    await queueLiveToolResponse(
      saved,
      provider,
      {
        id: review.callId,
        name: review.toolName!,
        response: {
          error:
            'Operation outcome is unknown. Do not retry; ask the user to inspect the result.',
        },
      },
      persist
    );
    emit(liveReviewEvent(review));
  }
}
