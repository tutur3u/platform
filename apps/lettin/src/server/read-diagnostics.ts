import { headers } from 'next/headers';
import { cache } from 'react';
import {
  PROFILE_REQUEST_HEADER,
  validProfileRequestId,
} from '../profile-proxy-diagnostics';

type ReadStage =
  | 'profile actor'
  | 'profile bindings'
  | 'profile creator'
  | 'profile worlds'
  | 'layout session'
  | 'layout workspace'
  | 'layout invitation'
  | 'layout workspaces'
  | 'layout navigation'
  | 'resolve actor'
  | 'resolve bindings'
  | 'read world'
  | 'D1 world access'
  | 'D1 world record'
  | 'D1 entries'
  | 'Supabase member names'
  | 'D1 collaborators'
  | 'D1 creators'
  | 'Supabase eligible members';

const requestIdentity = cache(async () => {
  if (process.env.TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS !== '1') return null;
  try {
    const value = (await headers()).get(PROFILE_REQUEST_HEADER);
    return validProfileRequestId(value) ? value : null;
  } catch {
    return null;
  }
});

function emit(
  requestId: string | null,
  stage: ReadStage,
  event: 'started' | 'completed' | 'failed',
  elapsedMs: number
) {
  if (!requestId) return;
  try {
    console.info(
      '[lettin-profile-read]',
      JSON.stringify({
        version: 1,
        requestId,
        stage,
        event,
        elapsedMs,
      })
    );
  } catch {
    /* Preserve the read's outcome. */
  }
}

function legacyLog(kind: 'info' | 'warn', ...values: unknown[]) {
  try {
    console[kind](...values);
  } catch {
    /* Preserve the read's outcome. */
  }
}

// Fixed stages only: never accept actor IDs, URLs, payloads, or error values.
export async function traceLettinRead<T>(
  stage: ReadStage,
  read: () => Promise<T>
): Promise<T> {
  if (
    process.env.CI !== 'true' &&
    process.env.LETTIN_READ_DIAGNOSTICS !== 'true'
  ) {
    return read();
  }
  const requestId = await requestIdentity();
  const started = performance.now();
  emit(requestId, stage, 'started', 0);
  legacyLog('info', '[lettin-read]', stage, 'started');
  try {
    const result = await read();
    legacyLog('info', '[lettin-read]', stage, 'completed', {
      elapsedMs: Math.round(performance.now() - started),
    });
    emit(
      requestId,
      stage,
      'completed',
      Math.round(performance.now() - started)
    );
    return result;
  } catch (error) {
    legacyLog('warn', '[lettin-read]', stage, 'failed', {
      elapsedMs: Math.round(performance.now() - started),
    });
    emit(requestId, stage, 'failed', Math.round(performance.now() - started));
    throw error;
  }
}
