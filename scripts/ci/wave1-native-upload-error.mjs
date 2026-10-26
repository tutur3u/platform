import { stripVTControlCharacters } from 'node:util';

const signals = new Set(['SIGINT', 'SIGTERM', 'SIGKILL']);

function redactKnown(message, secrets) {
  let value = message;
  for (const secret of secrets) {
    if (typeof secret !== 'string' || !secret.length) continue;
    value = value.replaceAll(secret, '[REDACTED]');
    value = value.replaceAll(encodeURIComponent(secret), '[REDACTED]');
    const compact = secret.replace(/[\s\p{Cf}]/gu, '');
    if (compact.length && compact.length <= 8192) {
      const pattern = [...compact]
        .map((char) => char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
        .join('[\\s\\p{Cf}]*');
      value = value.replace(new RegExp(pattern, 'gu'), '[REDACTED]');
    }
  }
  return value;
}

function redactFields(message) {
  const fields = /\b([a-z0-9_.-]+)["']?\s*[:=]\s*/giu;
  const credentialName =
    /auth|credentials?|pwd|signature|sig|token|key|secret|password/iu;
  let result = '',
    cursor = 0;
  for (let match = fields.exec(message); match; match = fields.exec(message)) {
    if (!credentialName.test(match[1])) continue;
    const start = fields.lastIndex;
    let end = start;
    const quote = message[start];
    if (quote === '"' || quote === "'") {
      end++;
      while (end < message.length) {
        if (message[end] === '\\') {
          end += 2;
          continue;
        }
        if (message[end++] === quote) break;
      }
      let continuation = end;
      while (
        /\s/u.test(message[continuation] ?? '') &&
        continuation < message.length
      )
        continuation++;
      if (message[continuation] === ';') {
        end = continuation;
        while (end < message.length && !',}]'.includes(message[end])) end++;
      }
    } else {
      while (end < message.length && !',}]'.includes(message[end])) end++;
    }
    result += `${message.slice(cursor, start)}[REDACTED]`;
    cursor = end;
    fields.lastIndex = end;
  }
  return result + message.slice(cursor);
}

function sanitize(message, secrets) {
  let value = stripVTControlCharacters(redactKnown(message, secrets))
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/]*@[^\s]*/giu, '[REDACTED URL]')
    // Every query value is hidden, including signed/encoded values and unknown key names.
    .replace(/([?&][^=\s&#?]+)=([^#\s&]*)/gu, '$1=[REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,]+/giu, '[REDACTED AUTH]');
  value = redactFields(value);
  return value
    .replace(/[A-Za-z0-9_+/.=%-]{24,}/gu, '[REDACTED]')
    .replaceAll('##[', '#[')
    .replaceAll('::', ': :')
    .slice(0, 300);
}

/** Keep bounded, sanitized diagnostics; never retain child output or causes. */
export class NativeUploadError extends Error {
  constructor(error, secrets = []) {
    super(
      'Native publication outcome is uncertain; inspect the matching version and retained receipt before any retry'
    );
    const rawStderr = Buffer.isBuffer(error?.stderr)
      ? error.stderr.subarray(0, 1024 * 1024).toString('utf8')
      : typeof error?.stderr === 'string'
        ? error.stderr.slice(0, 1024 * 1024)
        : '';
    // Known values must be removed before line splitting or Unicode/space normalization.
    const stderr = redactKnown(rawStderr, secrets);
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
