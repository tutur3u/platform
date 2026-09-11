import { requireRule } from '@tuturuuu/multiplayer';
import type { Env } from './env';

export type SponsorshipContext = {
  workshopId: string;
  workshopTitle: string;
  hostId: string;
  teamId: string;
  teamName: string;
  participantId: string;
  operation: 'compile' | 'analyze' | 'run' | 'scenario';
  scenarioId: string;
  jobId: string;
  sequence: number;
  receipts: { requestId: string; runId: string; credits: number }[];
};

export async function sponsoredGeneration(
  env: Env,
  system: string,
  input: unknown,
  phase: 'generation' | 'prompt_review' | 'agent_step' | 'result_coaching'
) {
  const context = env.sponsorship;
  requireRule(
    context && (env.authorizeSponsorship || env.COLAB_AI_API_KEY),
    'sponsorship_unavailable',
    503
  );
  const sequence = ++context.sequence;
  const body = JSON.stringify({
    model: env.COLAB_AI_MODEL || 'google/gemini-2.5-flash',
    instructions: system,
    prompt: JSON.stringify(input),
    sponsorship: {
      workshopId: context.workshopId,
      workshopTitle: context.workshopTitle,
      hostId: context.hostId,
      teamId: context.teamId,
      teamName: context.teamName,
      participantId: context.participantId,
      operation: context.operation,
      scenarioId: context.scenarioId,
      jobId: context.jobId,
      sequence,
      phase,
    },
  });
  const grant = env.authorizeSponsorship
    ? await env.authorizeSponsorship(body)
    : null;
  const response = await fetch('https://ai.tuturuuu.com/v1/colab/responses', {
    method: 'POST',
    headers: {
      ...(grant
        ? { 'X-Colab-Grant': grant }
        : { Authorization: `Bearer ${env.COLAB_AI_API_KEY}` }),
      'Content-Type': 'application/json',
      'Idempotency-Key': `${context.jobId}:${sequence}`,
      'X-Request-ID': `${context.jobId}:${sequence}`,
    },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  }).catch(() => {
    requireRule(false, 'sponsorship_unavailable', 503);
  });
  requireRule(response, 'sponsorship_unavailable', 503);
  requireRule(
    response.ok,
    response.status === 402
      ? 'sponsorship_exhausted'
      : 'sponsorship_unavailable',
    response.status === 402 ? 402 : 503
  );
  requireRule(
    response.headers.get('x-colab-sponsor-workspace') ===
      '00000000-0000-0000-0000-000000000000',
    'sponsorship_unavailable',
    503
  );
  const result = (await response.json().catch(() => {
    requireRule(false, 'sponsorship_unavailable', 503);
  })) as {
    id?: string;
    choices?: { message?: { content?: unknown } }[];
    tuturuuu?: { run_id?: string; billing?: { billedCredits?: number } };
  };
  requireRule(
    result && typeof result === 'object',
    'sponsorship_unavailable',
    503
  );
  const requestId = response.headers.get('x-request-id') ?? result.id;
  const credits = result.tuturuuu?.billing?.billedCredits;
  requireRule(
    requestId &&
      result.tuturuuu?.run_id &&
      typeof credits === 'number' &&
      Number.isFinite(credits) &&
      credits >= 0,
    'sponsorship_unavailable',
    503
  );
  context.receipts.push({ requestId, runId: result.tuturuuu.run_id, credits });
  return result.choices?.[0]?.message?.content;
}
