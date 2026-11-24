import {
  auditEmployeeCreationCli,
  employeeCreationCliClaims,
  takeEmployeeCreationCliQuota,
} from './employee-creation-cli';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
// Printable ASCII only: keeps control characters and log-forging input out of audit lines.
const LOGGABLE_EMAIL = /^[\x21-\x7e]+$/u;
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };

/** Only the target address is read from the body; nothing else is kept. */
async function targetEmail(request: Request) {
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { email?: unknown } | null;
  const email = body?.email;
  if (typeof email !== 'string' || email.length > 320) return null;
  const normalized = email.trim().toLowerCase();
  return LOGGABLE_EMAIL.test(normalized) ? normalized : null;
}

function resultOf(body: unknown) {
  if (!body || typeof body !== 'object') return 'unknown';
  const record = body as Record<string, unknown>;
  const value = record.status ?? record.code;
  return typeof value === 'string' ? value.slice(0, 64) : 'unknown';
}

/**
 * Wraps a CLI employee create: a per-actor quota before the request reaches
 * authorization or the journal, and one audit line for every attempt. Other
 * credentials (and CLI tokens while the flag is off) pass straight through.
 */
export async function guardEmployeeCreationCli(
  request: Request,
  handle: (request: Request) => Promise<Response>
) {
  let claims: ReturnType<typeof employeeCreationCliClaims>;
  try {
    claims = employeeCreationCliClaims(request);
  } catch {
    // The authorizer answers 503 for the same failure.
    return handle(request);
  }
  if (!claims) return handle(request);
  const operation = request.headers.get('idempotency-key');
  const audit = {
    actorUserId: claims.sub,
    tokenId: claims.jti,
    targetEmail: await targetEmail(request),
    operationId: operation && UUID.test(operation) ? operation : null,
  };
  let quota: Awaited<ReturnType<typeof takeEmployeeCreationCliQuota>>;
  try {
    quota = await takeEmployeeCreationCliQuota(claims.sub);
  } catch {
    quota = { allowed: false, status: 503, retryAfter: 60 };
  }
  if (!quota.allowed) {
    const code =
      quota.status === 429
        ? 'employee_creation_rate_limited'
        : 'employee_creation_unavailable';
    auditEmployeeCreationCli({
      ...audit,
      httpStatus: quota.status,
      result: code,
    });
    return Response.json(
      { code },
      {
        status: quota.status,
        headers: { ...noStore, 'Retry-After': String(quota.retryAfter) },
      }
    );
  }
  const response = await handle(request);
  auditEmployeeCreationCli({
    ...audit,
    httpStatus: response.status,
    result: resultOf(
      await response
        .clone()
        .json()
        .catch(() => null)
    ),
  });
  return response;
}
