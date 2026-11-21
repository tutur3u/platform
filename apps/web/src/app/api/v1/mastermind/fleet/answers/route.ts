import { NextResponse } from 'next/server';
import { fleetAckSchema } from '@/lib/mastermind/fleet/contract';
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

/** Orchestrator pull: owner answers not yet acknowledged at their revision. */
export async function GET(request: Request) {
  const auth = await authorizeFleetPublisher(request, 0);
  if (!auth.ok) return auth.response;
  try {
    // Open decisions plus those open in the last 48 hours, so an answer
    // outlives its decision leaving the snapshot.
    const stored = await readFleetState(auth.store);
    const answers = pendingFleetAnswers(
      await readFleetAnswers(
        auth.store,
        await answerableDecisionIds(auth.store, stored)
      )
    );
    return NextResponse.json(
      {
        answers: answers.map((answer) => ({
          decisionId: answer.decisionId,
          revision: answer.revision,
          action: answer.action,
          ...(answer.optionId ? { optionId: answer.optionId } : {}),
          ...(answer.text ? { text: answer.text } : {}),
          answeredAt: answer.answeredAt,
        })),
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
