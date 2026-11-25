import { createHash } from 'node:crypto';

const WITHHELD = '[message withheld: unrecognised]';
const GOOGLE_STATUSES = new Set([
  'INVALID_ARGUMENT',
  'FAILED_PRECONDITION',
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'ABORTED',
  'RESOURCE_EXHAUSTED',
  'INTERNAL',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'UNKNOWN',
]);
const GOOGLE_REASONS = new Set([
  'badRequest',
  'forbidden',
  'invalid',
  'notFound',
  'required',
  'changesNotSentForReview',
  'changesInReviewBehavior',
  'INVALID_ARGUMENT',
  'FAILED_PRECONDITION',
]);

// Complete messages only. Never interpolate text supplied by Play.
const PLAY_MESSAGES = new Set([
  // Review must be submitted manually.
  'Changes cannot be sent for review automatically.',
  // Play's API hint for deferring review.
  'Changes cannot be sent for review automatically. Please set the query parameter changesNotSentForReview to true.',
  // The review deferral hint can include the next step in Play Console.
  'Changes cannot be sent for review automatically. Please set the query parameter changesNotSentForReview to true. Once committed, you can manually send the changes for review in the Google Play Console.',
  // Play's API hint when review must happen immediately.
  'Changes cannot be set to not be sent for review.',
  // This update conflicts with managed publishing.
  'Managed publishing is enabled.',
  // The version code is reserved by an earlier upload.
  'Version code has already been used.',
  // Release notes exceed the store length limit.
  'Release notes are too long.',
  // The requested testing track does not exist.
  'Track not found.',
  // No testers can access the track.
  'No testers are configured for this track.',
  // No countries are selected for the release.
  'No countries or regions are selected for this track.',
  // Draft apps require draft releases.
  'Only releases with status draft may be created on draft app.',
  // A required policy declaration is incomplete.
  'App content declarations are incomplete.',
]);

const GOOGLE_FIELD =
  /^(?:track|changesNotSentForReview|changesInReviewBehavior|releases(?:\[\d{1,4}\](?:\.(?:name|status|userFraction|countryTargeting|inAppUpdatePriority|versionCodes(?:\[\d{1,4}\])?|releaseNotes(?:\[\d{1,4}\](?:\.(?:language|text))?)?))?)?)$/u;

function decodePercentEscapes(value) {
  return value.replace(/(?:%[0-9a-f]{2})+/giu, (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  });
}

function normalizePlayMessage(value) {
  let decoded = decodePercentEscapes(value);
  if (/%[0-9a-f]{2}/iu.test(decoded)) decoded = decodePercentEscapes(decoded);
  return decoded
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
}

function playMessageDiagnostic(value) {
  if (typeof value !== 'string' || !value.length) return '';
  if (value.length > 8192) return WITHHELD;
  const normalized = normalizePlayMessage(value);
  if (PLAY_MESSAGES.has(normalized)) return normalized;
  const hash = createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 8);
  return `${WITHHELD} sha256:${hash}`;
}

function googleApiErrorDiagnostic(error) {
  const details = Array.isArray(error.details) ? error.details.slice(0, 8) : [];
  const errors = Array.isArray(error.errors) ? error.errors.slice(0, 8) : [];
  const reasons = [...errors, ...details]
    .map((entry) => entry?.reason)
    .filter((reason) => GOOGLE_REASONS.has(reason));
  const fields = details.flatMap((entry) =>
    [entry?.fieldViolations, entry?.violations].flatMap((violations) =>
      Array.isArray(violations)
        ? violations
            .slice(0, 8)
            .map((violation) => violation?.field)
            .filter(
              (field) => typeof field === 'string' && GOOGLE_FIELD.test(field)
            )
        : []
    )
  );
  return [
    GOOGLE_STATUSES.has(error.status) ? error.status : '',
    Number.isInteger(error.code) && error.code >= 400 && error.code <= 599
      ? String(error.code)
      : '',
    ...[...new Set(reasons)].slice(0, 3),
    ...[...new Set(fields)].slice(0, 3),
    playMessageDiagnostic(error.message),
  ]
    .filter(Boolean)
    .join(', ');
}

export function playDiagnosticPath(pathname) {
  const match = /^\/androidpublisher\/v3\/applications\/[^/]+(.*)$/u.exec(
    pathname
  );
  const base = '/androidpublisher/v3/applications/[redacted]';
  if (!match) return '/androidpublisher/[redacted]';
  const [, suffix] = match;
  if (suffix === '/edits') return `${base}/edits`;
  if (/^\/edits\/[^/]+:commit$/u.test(suffix))
    return `${base}/edits/[redacted]:commit`;
  if (/^\/edits\/[^/]+\/tracks(?:\/[^/]+)?$/u.test(suffix))
    return `${base}/edits/[redacted]/tracks`;
  if (/^\/edits\/[^/]+\/listings$/u.test(suffix))
    return `${base}/edits/[redacted]/listings`;
  if (/^\/edits\/[^/]+$/u.test(suffix)) return `${base}/edits/[redacted]`;
  if (/^\/tracks\/[^/]+\/releases$/u.test(suffix))
    return `${base}/tracks/[redacted]/releases`;
  return `${base}/[redacted]`;
}

export function storeApiErrorDiagnostic(payload, { play = false } = {}) {
  if (payload?.error && typeof payload.error === 'object')
    return googleApiErrorDiagnostic(payload.error);
  if (play) return '';
  if (!Array.isArray(payload?.errors)) return '';
  return payload.errors
    .slice(0, 3)
    .map((error) => {
      const code = error?.code;
      const pointer = error?.source?.pointer;
      const safeCode =
        typeof code === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(code)
          ? code
          : '';
      const safePointer =
        typeof pointer === 'string' &&
        /^\/(?:data|attributes|relationships)(?:\/[A-Za-z0-9_~.-]+){0,8}$/.test(
          pointer
        ) &&
        pointer.length <= 120
          ? pointer
          : '';
      return [safeCode, safePointer].filter(Boolean).join(' at ');
    })
    .filter(Boolean)
    .join(', ');
}
