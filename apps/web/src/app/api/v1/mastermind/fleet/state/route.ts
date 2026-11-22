import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { readFleetAlerts } from '@/lib/mastermind/fleet/alerts';
import {
  isFleetOwner,
  MASTERMIND_APP_SESSION,
} from '@/lib/mastermind/fleet/auth';
import {
  FLEET_MAX_BODY_BYTES,
  type FleetAnswerRecord,
  fleetStateSchema,
} from '@/lib/mastermind/fleet/contract';
import {
  fleetPushEnabled,
  notifyNewFleetDecision,
} from '@/lib/mastermind/fleet/decision-push';
import {
  authorizeFleetPublisher,
  FLEET_NO_STORE,
  fleetError,
  fleetStore,
  logFleetStoreFailure,
} from '@/lib/mastermind/fleet/http';
import {
  readFleetAnswers,
  readFleetState,
  StaleFleetSnapshotError,
  writeFleetState,
} from '@/lib/mastermind/fleet/store';
import {
  FLEET_FEATURES_HEADER,
  fleetStateView,
  parseFleetFeatures,
} from '@/lib/mastermind/fleet/view';

/** What the phone sees of an answer: never the reply text itself. */
function answerSummary(answer: FleetAnswerRecord) {
  return {
    action: answer.action,
    ...(answer.optionId ? { optionId: answer.optionId } : {}),
    revision: answer.revision,
    answeredAt: answer.answeredAt,
    pickedUp: answer.pickedUpRevision >= answer.revision,
  };
}

/** Owner read of the latest fleet snapshot with its answer receipts. */
export const GET = withSessionAuth(
  async (request, { user }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const store = await fleetStore();
    if (!store) return fleetError('unavailable', 503);

    const features = parseFleetFeatures(
      request.headers.get(FLEET_FEATURES_HEADER)
    );
    // Fails open: unavailable alerts leave the field out, never the snapshot.
    const alertsRead = features.has('alerts')
      ? readFleetAlerts()
      : Promise.resolve(null);

    let stored: Awaited<ReturnType<typeof readFleetState>>;
    let answers: Record<string, FleetAnswerRecord>;
    try {
      stored = await readFleetState(store, { cached: true });
      if (!stored) return fleetError('not_published', 404);
      answers = await readFleetAnswers(
        store,
        stored.state.decisions.map((decision) => decision.id)
      );
    } catch {
      return fleetError('unavailable', 503);
    }

    const alerts = await alertsRead;
    const state = fleetStateView(stored.state, { features });
    const openIds = new Set(state.decisions.map((d) => d.id));
    const receipts = Object.fromEntries(
      Object.values(answers)
        .filter((answer) => openIds.has(answer.decisionId))
        .map((answer) => [answer.decisionId, answerSummary(answer)])
    );
    const etag = `"${createHash('sha256')
      .update(
        // Login expiry and the feature set change the view without a publish.
        `${stored.etag}|${stored.receivedAt}|${JSON.stringify(receipts)}|${[
          ...features,
        ]
          .sort()
          .join(',')}|${state.decisions
          .map((d) => `${d.id}:${d.login?.state ?? ''}`)
          .join(',')}|${alerts ? JSON.stringify(alerts) : '-'}`
      )
      .digest('hex')
      .slice(0, 32)}"`;
    const headers = { ...FLEET_NO_STORE, etag, vary: FLEET_FEATURES_HEADER };
    if (request.headers.get('if-none-match') === etag)
      return new NextResponse(null, { status: 304, headers });

    return NextResponse.json(
      {
        state,
        receivedAt: stored.receivedAt,
        answers: receipts,
        ...(alerts ? { alerts } : {}),
      },
      { headers }
    );
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
    // The Mastermind web Worker reads with the owner's short-lived
    // satellite session; the owner and permission checks still apply.
    allowAppSessionAuth: MASTERMIND_APP_SESSION,
  }
);

/** Orchestrator publish: HMAC-signed, schema-validated, scrubbed, capped. */
export async function PUT(request: Request) {
  const auth = await authorizeFleetPublisher(request, FLEET_MAX_BODY_BYTES);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = JSON.parse(auth.body);
  } catch {
    return fleetError('invalid_json', 400);
  }
  const parsed = fleetStateSchema.safeParse(json);
  if (!parsed.success) return fleetError('invalid_state', 422);

  try {
    const previous =
      fleetPushEnabled() && parsed.data.decisions.length
        ? await readFleetState(auth.store).catch(() => undefined)
        : undefined;
    const stored = await writeFleetState(auth.store, parsed.data);
    if (previous !== undefined) {
      await notifyNewFleetDecision(auth.store, previous, stored).catch(() =>
        console.warn('Mastermind fleet decision push failed')
      );
    }
    return NextResponse.json(
      { accepted: true, etag: stored.etag, receivedAt: stored.receivedAt },
      { headers: FLEET_NO_STORE }
    );
  } catch (error) {
    // A newer snapshot is already stored; this one must not replace it.
    if (error instanceof StaleFleetSnapshotError)
      return fleetError('stale_snapshot', 409);
    logFleetStoreFailure(error);
    return fleetError('unavailable', 503);
  }
}
