import { stripVTControlCharacters } from 'node:util';

const signals = new Set(['SIGINT', 'SIGTERM', 'SIGKILL']);
const diagnosticLineLimit = 4096;
const tokenSeparator =
  '(?:[\\s\\p{C}\\p{M}│┃|]|\\[code:[ \t]{0,16}[0-9]{1,9}\\]){0,64}';

function redactKnown(message, secrets) {
  let value = message;
  for (const secret of secrets) {
    if (typeof secret !== 'string' || !secret.length) continue;
    value = value.replaceAll(secret, '[REDACTED]');
    value = value.replaceAll(encodeURIComponent(secret), '[REDACTED]');
    const compact = secret.replace(/[\s\p{C}\p{M}]/gu, '');
    if (compact.length && compact.length <= 8192) {
      const pattern = [...compact]
        .map((char) => char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
        .join(tokenSeparator);
      value = value.replace(new RegExp(pattern, 'gu'), '[REDACTED]');
    }
  }
  return value;
}

function redactFields(message) {
  const fields = /\b([a-z0-9_.-]+)[\]"'`)]*\s*[:=]\s*/giu;
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
  // Scrub the entire raw value before truncation, including tokens crossing line boundaries.
  const raw = redactKnown(message, secrets);
  const bounded = raw.split(/\r?\n/u, 1)[0].slice(0, diagnosticLineLimit);
  const normalized = stripVTControlCharacters(bounded).replace(
    /[\p{Cc}\p{Cf}]/gu,
    ' '
  );
  let value = redactKnown(normalized, secrets)
    .replace(/\s+/gu, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/]*@[^\s]*/giu, '[REDACTED URL]')
    .replace(/([?&][^=\s&#?]+)=([^#\s&]*)/gu, '$1=[REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,]+/giu, '[REDACTED AUTH]');
  value = redactFields(value);
  return value
    .replace(/[A-Za-z0-9_+/.=%-]{24,}/gu, '[REDACTED]')
    .replace(/#{2,}\[/gu, '#[')
    .replace(/:{2,}/gu, ': :')
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
    const codes = new Set();
    // Bound each line before any diagnostic matching regex. The full raw known-token
    // pass above remains necessary for credentials split across lines or controls.
    const lines = stderr
      .split(/\r?\n/u)
      .map((line) => line.slice(0, diagnosticLineLimit));
    let cfErrors = [];
    for (const rawLine of lines) {
      if (!rawLine.includes('[code:')) continue;
      const line = stripVTControlCharacters(rawLine);
      for (const match of line.matchAll(/\[code:\s*([0-9]{1,9})\]/gu))
        codes.add(Number(match[1]));
      if (cfErrors.length >= 8) continue;
      const match = /^\s*(.+?)\s*\[code:\s*([0-9]{1,9})\]\s*$/u.exec(line);
      if (match)
        cfErrors.push({
          code: Number(match[2]),
          message: sanitize(match[1], secrets),
        });
    }
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
    const rawHeadline = lines.find((line) => line.includes('[ERROR]'));
    const headline =
      rawHeadline === undefined
        ? undefined
        : stripVTControlCharacters(rawHeadline);
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
