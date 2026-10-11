export type VerificationStage = 'health' | 'login' | 'worlds';
export type FailureCategory =
  | 'http'
  | 'parse'
  | 'shape'
  | 'criteria'
  | 'network'
  | 'timeout';
export interface VerificationDiagnostic {
  attempt: number;
  stage: VerificationStage;
  failureCategory: FailureCategory;
  httpStatus: number | null;
  parseSucceeded: boolean;
  serviceMatch: boolean;
  statusMatch: boolean;
  tagMatch: boolean;
  databaseMatch: boolean;
  artworkMatch: boolean;
  timeout: boolean;
}
interface Dependencies {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  sleep: (milliseconds: number) => Promise<void>;
  log: (diagnostic: VerificationDiagnostic) => void;
}
const origin = 'https://lettin.tuturuuu.com';
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function timedOut(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
export async function verifyDeployment(
  expected: string,
  dependencies: Dependencies
) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    const diagnostic: VerificationDiagnostic = {
      attempt,
      stage: 'health',
      failureCategory: 'network',
      httpStatus: null,
      parseSucceeded: false,
      serviceMatch: false,
      statusMatch: false,
      tagMatch: false,
      databaseMatch: false,
      artworkMatch: false,
      timeout: false,
    };
    try {
      const response = await dependencies.fetch(
        `${origin}/api/v1/lettin/health`,
        {
          signal: AbortSignal.timeout(15_000),
        }
      );
      diagnostic.httpStatus = response.status;
      let data: unknown;
      try {
        data = await response.json();
        diagnostic.parseSucceeded = true;
      } catch (error) {
        diagnostic.timeout = timedOut(error);
        diagnostic.failureCategory = diagnostic.timeout ? 'timeout' : 'parse';
      }
      if (diagnostic.parseSucceeded) {
        if (!object(data)) diagnostic.failureCategory = 'shape';
        else {
          diagnostic.serviceMatch = data.service === 'lettin';
          diagnostic.statusMatch = data.status === 'ok';
          diagnostic.tagMatch =
            object(data.deployment) && data.deployment.tag === expected;
          diagnostic.databaseMatch =
            object(data.storage) && data.storage.database === 'd1';
          diagnostic.artworkMatch =
            object(data.storage) && data.storage.artwork === 'r2';
          diagnostic.failureCategory = response.ok ? 'criteria' : 'http';
          if (
            response.ok &&
            diagnostic.serviceMatch &&
            diagnostic.statusMatch &&
            diagnostic.tagMatch &&
            diagnostic.databaseMatch &&
            diagnostic.artworkMatch
          ) {
            for (const [stage, path] of [
              ['login', '/login'],
              ['worlds', '/api/v1/lettin/worlds'],
            ] as const) {
              diagnostic.stage = stage;
              diagnostic.httpStatus = null;
              diagnostic.failureCategory = 'network';
              const smoke = await dependencies.fetch(`${origin}${path}`, {
                signal: AbortSignal.timeout(15_000),
              });
              diagnostic.httpStatus = smoke.status;
              if (!smoke.ok) {
                diagnostic.failureCategory = 'http';
                break;
              }
              if (stage === 'worlds') return;
            }
          }
        }
      }
    } catch (error) {
      diagnostic.timeout = timedOut(error);
      diagnostic.failureCategory = diagnostic.timeout ? 'timeout' : 'network';
    }
    dependencies.log(diagnostic);
    // Preserve the final-attempt delay as well as the propagation retry window.
    await dependencies.sleep(5000);
  }
  throw new Error('Lettin version and storage verification failed');
}
export async function runVerifierCli(
  env: { EXPECTED_VERSION_TAG?: string },
  dependencies: Dependencies = {
    fetch,
    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    log: (diagnostic) =>
      console.warn('lettin_verification_attempt', diagnostic),
  }
) {
  const expected = env.EXPECTED_VERSION_TAG;
  if (!expected) throw new Error('EXPECTED_VERSION_TAG is required');
  await verifyDeployment(expected, dependencies);
  console.info('Verified Lettin Worker version, D1, R2, and public routes');
}
if (import.meta.main)
  await runVerifierCli({
    EXPECTED_VERSION_TAG: process.env.EXPECTED_VERSION_TAG,
  });
