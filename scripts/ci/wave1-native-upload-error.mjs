import { stripVTControlCharacters } from 'node:util';

const signals = new Set(['SIGINT', 'SIGTERM', 'SIGKILL']);

function sanitize(message, secrets) {
  let value = stripVTControlCharacters(message)
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ');
  for (const secret of secrets)
    if (typeof secret === 'string' && secret.length)
      value = value.replaceAll(secret, '[REDACTED]');
  return value
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/]*@[^\s]*/giu, '[REDACTED URL]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/giu, '[REDACTED AUTH]')
    .replace(
      /\b((?:[a-z_-]*(?:token|key|secret|password)[a-z_-]*)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
      '$1[REDACTED]'
    )
    .replace(/[A-Za-z0-9_+/.=-]{24,}/gu, '[REDACTED]')
    .slice(0, 300);
}

/** Keep bounded, sanitized diagnostics; never retain child output or causes. */
export class NativeUploadError extends Error {
  constructor(error, secrets = []) {
    super(
      'Wrangler publication outcome is uncertain; inspect the matching version and retained receipt before any retry'
    );
    const stderr = Buffer.isBuffer(error?.stderr)
      ? error.stderr.subarray(0, 1024 * 1024).toString('utf8')
      : typeof error?.stderr === 'string'
        ? error.stderr.slice(0, 1024 * 1024)
        : '';
    const codes = new Set(
      [...stderr.matchAll(/\[code:\s*([0-9]{1,9})\]/gu)].map((match) =>
        Number(match[1])
      )
    );
    const lines = stripVTControlCharacters(stderr).split(/\r?\n/u);
    let cfErrors = lines
      .flatMap((line) => {
        const match = /^\s*(.+?)\s*\[code:\s*([0-9]{1,9})\]\s*$/u.exec(line);
        return match
          ? [{ code: Number(match[2]), message: sanitize(match[1], secrets) }]
          : [];
      })
      .slice(0, 8);
    if (!cfErrors.length) {
      try {
        const body = JSON.parse(stderr);
        if (Array.isArray(body.errors))
          cfErrors = body.errors
            .filter(
              (entry) =>
                Number.isSafeInteger(entry?.code) &&
                entry.code >= 0 &&
                entry.code <= 999999999 &&
                typeof entry.message === 'string'
            )
            .slice(0, 8)
            .map((entry) => ({
              code: entry.code,
              message: sanitize(entry.message, secrets),
            }));
      } catch {
        // Only provider pairs or the one explicit ERROR headline are retained.
      }
    }
    for (const entry of cfErrors) codes.add(entry.code);
    const headline = lines.find((line) => line.includes('[ERROR]'));
    this.uploadFailure = Object.freeze({
      exitCode:
        Number.isInteger(error?.status) &&
        error.status >= 0 &&
        error.status <= 255
          ? error.status
          : null,
      signal: signals.has(error?.signal) ? error.signal : null,
      cfCode: codes.size === 1 ? [...codes][0] : null,
      ...(cfErrors.length
        ? { cfErrors }
        : headline
          ? {
              headline: sanitize(
                headline.slice(headline.indexOf('[ERROR]')),
                secrets
              ),
            }
          : {}),
    });
  }
}

export function productionFailureMessage(error) {
  const message =
    'Production upload refused or uncertain; inspect the retained receipt and provider versions before another attempt';
  return error instanceof NativeUploadError
    ? `${message}; uploadFailure=${JSON.stringify(error.uploadFailure)}`
    : message;
}
