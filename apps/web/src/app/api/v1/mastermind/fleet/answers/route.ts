import { NextResponse } from 'next/server';
import {
  type FleetAnswerRecord,
  fleetAckSchema,
} from '@/lib/mastermind/fleet/contract';
import {
  authorizeFleetPublisher,
  FLEET_NO_STORE,
  fleetError,
} from '@/lib/mastermind/fleet/http';
import {
  acknowledgeFleetAnswers,
  pendingFleetAnswers,
  readFleetAnswers,
  answerableDecisionIds,
  readFleetState,
} from '@/lib/mastermind/fleet/store';

type PulledAnswer = Omit<FleetAnswerRecord, 'pickedUpRevision' | 'earlier'>;

/** What the orchestrator receives of one answer: never the actor. */
const pulled = (answer: PulledAnswer) => ({
  decisionId: answer.decisionId,
  revision: answer.revision,
  action: answer.action,
  ...(answer.optionId ? { optionId: answer.optionId } : {}),
  ...(answer.text ? { text: answer.text } : {}),
  ...(answer.sealed ? { sealed: answer.sealed } : {}),
  ...(answer.owner ? { owner: answer.owner } : {}),
  ...(answer.pair ? { pair: answer.pair } : {}),
  answeredAt: answer.answeredAt,
});

/**
 * Orchestrator pull: owner answers not yet acknowledged at their revision.
 * A pairing lists every unacknowledged revision, oldest first, because the
 * machine accepts the first whose MAC verifies.
 */
export async function GET(request: Request) {
  const auth = await authorizeFleetPublisher(request, 0);
  if (!auth.ok) return auth.response;
  try {
    // Open decisions, those open in the last 48 hours and secret decisions
    // with an unacknowledged answer, so an answer outlives its decision
    // leaving the snapshot.
    const stored = await readFleetState(auth.store);
    const answers = pendingFleetAnswers(
      await readFleetAnswers(
        auth.store,
        await answerableDecisionIds(auth.store, stored)
      )
    );
    return NextResponse.json(
      {
        answers: answers.flatMap((answer) => [
          ...(answer.earlier ?? [])
            .filter(
              (entry) =>
                entry.revision > answer.pickedUpRevision &&
                (entry.sealed || entry.owner || entry.pair)
            )
            .map(pulled),
          pulled(answer),
        ]),
      },
      { headers: FLEET_NO_STORE }
    );
  } catch {
    return fleetError('unavailable', 503);
  }
}

/** Orchestrator ack after the answer is durably written on its side. */
export async function POST(request: Request) {
  const auth = await authorizeFleetPublisher(request, 16 * 1024);
  if (!auth.ok) return auth.response;
  let json: unknown;
  try {
    json = JSON.parse(auth.body);
  } catch {
    return fleetError('invalid_json', 400);
  }
  const parsed = fleetAckSchema.safeParse(json);
  if (!parsed.success) return fleetError('invalid_ack', 422);
  try {
    const acknowledged = await acknowledgeFleetAnswers(
      auth.store,
      parsed.data.acks
    );
    return NextResponse.json({ acknowledged }, { headers: FLEET_NO_STORE });
  } catch {
    return fleetError('unavailable', 503);
  }
}
