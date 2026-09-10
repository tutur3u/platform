import type { Session } from '@google/genai/web';
import { applyLiveCheckpoint } from '../../src/features/live-assistant/context';
import type { LiveAssistantEvent } from '../../src/features/live-assistant/contracts';
import type { LiveProposal } from './reviews';
import { liveRoomCommand } from './room';
import { checkpointSchema, type SavedSession } from './session-state';
import type { LiveEnvironment, LiveTurnArchive } from './storage';

export async function executeLiveTool(
  context: {
    saved: SavedSession;
    provider?: Session;
    env: LiveEnvironment;
    archive: LiveTurnArchive;
    persist: () => Promise<void>;
    emit: (event: LiveAssistantEvent) => void;
    emitReview: (review: LiveProposal) => void;
  },
  callId: string,
  name: string,
  args: Record<string, unknown>
) {
  const { saved, provider, env, archive, persist, emit, emitReview } = context;
  const respond = (response: Record<string, unknown>) =>
    provider?.sendToolResponse({
      functionResponses: [{ id: callId, name, response }],
    });
  if (
    saved.claims.mode === 'personal' &&
    saved.workspace?.tools.some((tool) => tool.name === name)
  ) {
    if (
      saved.reviews.some((review) =>
        ['pending', 'processing'].includes(review.status)
      )
    ) {
      respond({ error: 'Resolve the pending review first' });
      return;
    }
    const review: LiveProposal = {
      id: crypto.randomUUID(),
      timezone: saved.timezone,
      callId,
      name: 'workspace_tool',
      toolName: name,
      args,
      text: name.replace(/^workspace_/, '').replaceAll('_', ' '),
      status: 'pending',
      expiresAt: Date.now() + 5 * 60000,
    };
    saved.reviews = [...saved.reviews.slice(-19), review];
    await persist();
    emitReview(review);
    return;
  }
  if (name === 'current_time') {
    respond({ now: new Date().toISOString(), timezone: saved.timezone });
    return;
  }
  if (name === 'meeting_context') {
    respond(
      await liveRoomCommand<Record<string, unknown>>(
        env,
        saved.claims,
        saved.identity,
        { action: 'live.context' }
      )
    );
    return;
  }
  if (name === 'recall_conversation') {
    respond(
      await archive.search(
        String(args.query ?? '').slice(0, 200),
        typeof args.before === 'string' && /^turn:\d{12}$/.test(args.before)
          ? args.before
          : undefined
      )
    );
    return;
  }
  if (name === 'organize_context') {
    const parsed = checkpointSchema.safeParse(args);
    if (!parsed.success) {
      respond({ error: 'Invalid checkpoint' });
      return;
    }
    const through =
      saved.journal.turns.at(-9)?.at ??
      saved.journal.turns.at(-1)?.at ??
      new Date().toISOString();
    saved.journal = applyLiveCheckpoint(
      saved.journal,
      { ...parsed.data, through },
      through
    );
    await persist();
    respond({ saved: true });
    emit({
      type: 'context',
      checkpoints: saved.journal.checkpoints.length,
      retainedTurns: saved.journal.turns.length,
      compressed: true,
    });
    return;
  }
  if (
    saved.claims.mode === 'personal' &&
    ['remember', 'propose_room_reply'].includes(name) &&
    typeof args.text === 'string' &&
    args.text.trim()
  ) {
    if (saved.reviews.some((review) => review.status === 'pending')) {
      respond({ error: 'Resolve the pending review first' });
      return;
    }
    const proposal: LiveProposal = {
      id: crypto.randomUUID(),
      timezone: saved.timezone,
      callId,
      name: name as LiveProposal['name'],
      text: args.text.slice(0, name === 'remember' ? 1000 : 4000),
      category: ['fact', 'project'].includes(String(args.category))
        ? (args.category as 'fact' | 'project')
        : 'preference',
      status: 'pending',
      expiresAt: Date.now() + 5 * 60_000,
    };
    saved.reviews = [...saved.reviews.slice(-19), proposal];
    await persist();
    emitReview(proposal);
    return;
  }
  respond({ error: 'Tool unavailable' });
}
