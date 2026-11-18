import type { Session } from '@google/genai/web';
import { applyLiveCheckpoint } from '../../features/live-assistant/context';
import type { LiveAssistantEvent } from '../../features/live-assistant/contracts';
import { requireCurrentPrivateGrant } from './private-grant';
import {
  LIVE_QUIZ_ARENA_TOOLS,
  type LiveQuizArenaTool,
  proposeQuizArenaAction,
} from './quiz-arena';
import type { LiveProposal } from './reviews';
import { livePollCommand, liveRoomCommand } from './room';
import { checkpointSchema, type SavedSession } from './session-state';
import type { LiveEnvironment, LiveTurnArchive } from './storage';
import { liveWorkspaceAllowed } from './workspace-gate';

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
  if (name === 'meeting_context' || name === 'propose_room_reply') return;
  const respond = (response: Record<string, unknown>) =>
    provider?.sendToolResponse({
      functionResponses: [{ id: callId, name, response }],
    });
  if (
    name === 'draft_poll' ||
    name === 'launch_poll' ||
    name === 'summarize_poll'
  ) {
    try {
      if (
        !saved.identity.isHost ||
        saved.claims.app === 'parley' ||
        !liveWorkspaceAllowed(env, saved)
      ) {
        respond({
          error: 'Only the meeting host can manage polls in Private Mira',
        });
        return;
      }
      await requireCurrentPrivateGrant(env, saved);
      respond(
        await livePollCommand(env, saved.claims, saved.identity, name, args)
      );
    } catch {
      respond({ error: 'Poll action is unavailable' });
    }
    return;
  }
  if (LIVE_QUIZ_ARENA_TOOLS.includes(name)) {
    try {
      if (
        !saved.identity.isHost ||
        saved.claims.app === 'parley' ||
        !liveWorkspaceAllowed(env, saved)
      ) {
        respond({
          error: 'Only the meeting host can run Quiz Arena in Private Mira',
        });
        return;
      }
      await requireCurrentPrivateGrant(env, saved);
      if (
        saved.reviews.some((review) =>
          ['pending', 'processing'].includes(review.status)
        )
      ) {
        respond({ error: 'Resolve the pending review first' });
        return;
      }
      // The tool call only proposes; the host approves the exact action.
      const proposal = await proposeQuizArenaAction(
        env,
        saved.claims,
        saved.identity,
        name as LiveQuizArenaTool,
        args
      );
      if ('error' in proposal) {
        respond(proposal);
        return;
      }
      const review: LiveProposal = {
        id: crypto.randomUUID(),
        callId,
        name: 'quiz_arena',
        toolName: name,
        args: proposal.args,
        text: proposal.text,
        status: 'pending',
        expiresAt: Date.now() + 5 * 60000,
      };
      saved.reviews = [...saved.reviews.slice(-19), review];
      await persist();
      emitReview(review);
    } catch {
      respond({ error: 'Quiz Arena action is unavailable' });
    }
    return;
  }
  if (
    ['read_selected_code', 'explain_code_lines', 'propose_code_fix'].includes(
      name
    )
  ) {
    if (
      saved.claims.app !== 'meet' ||
      saved.claims.mode !== 'personal' ||
      !saved.billing ||
      saved.billingFinalized ||
      saved.ended
    ) {
      respond({ error: 'Code collaboration is unavailable' });
      return;
    }
    try {
      await requireCurrentPrivateGrant(env, saved);
      respond(
        await liveRoomCommand<Record<string, unknown>>(
          env,
          saved.claims,
          saved.identity,
          {
            action: 'programming.voiceContext',
            sessionId: saved.claims.sessionId,
            ...(name === 'read_selected_code'
              ? {}
              : {
                  id: args.id,
                  answer: {
                    explanation: args.explanation,
                    replacement:
                      name === 'propose_code_fix' ? args.replacement : null,
                  },
                }),
          }
        )
      );
    } catch {
      respond({
        error: 'Ask the host to share a code selection for this session',
      });
    }
    return;
  }
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
    const boundary = saved.journal.turns.at(-9) ?? saved.journal.turns.at(-1);
    const through =
      boundary?.sequence ?? boundary?.at ?? new Date().toISOString();
    saved.journal = applyLiveCheckpoint(
      saved.journal,
      { ...parsed.data, through: String(through) },
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
