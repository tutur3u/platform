import { createHash } from 'node:crypto';
export type FailureClass = 'usage-limit' | 'capacity' | 'auth' | 'other';
export function recoveryAdmissionKey(
  threadId: string,
  runId: string,
  failure: FailureClass
): string {
  return `recovery:${createHash('sha256').update(`${threadId}\0${runId}\0${failure}`).digest('hex')}`;
}
export function failureClass(
  message: string,
  classification?: string | null
): FailureClass {
  if (
    classification === 'usage_limit' ||
    /usage.limit|session limit|hit your.*limit|quota.*exceed|rate.limit/i.test(
      message
    )
  )
    return 'usage-limit';
  if (
    /unauthori[sz]ed|authentication|invalid.*(?:key|credential)|login|sign.in|oauth/i.test(
      message
    )
  )
    return 'auth';
  if (
    /capacity|overload|resource.exhaust|temporarily unavailable/i.test(message)
  )
    return 'capacity';
  return 'other';
}
export function safeReceipt(
  message: string,
  kind: FailureClass
): { text: string; redacted: boolean } {
  if (kind === 'auth')
    return {
      text: '[authentication failure receipt withheld]',
      redacted: true,
    };
  const text = message
    .slice(0, 4096)
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|sk-ant)-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[redacted]'
    );
  return { text, redacted: text !== message };
}
export function receiptReset(
  message: string,
  observedAt: string,
  timezone?: string
): string | null {
  const iso = message.match(
    /\bresets?(?:\s+at)?\s*[:=]?\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))\b/
  )?.[1];
  if (iso && Number.isFinite(Date.parse(iso)))
    return new Date(iso).toISOString();
  const clock = message.match(/resets?\s+(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (!clock || !timezone || !Number.isFinite(Date.parse(observedAt)))
    return null;
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  try {
    const format = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const wall = (date: Date) => {
      const p = Object.fromEntries(
        format.formatToParts(date).map((part) => [part.type, part.value])
      );
      return Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
        Number(p.second)
      );
    };
    const observed = new Date(observedAt);
    const local = new Date(wall(observed));
    local.setUTCHours(
      (hour % 12) + (clock[3]?.toLowerCase() === 'pm' ? 12 : 0),
      minute,
      0,
      0
    );
    if (local.getTime() <= wall(observed))
      local.setUTCDate(local.getUTCDate() + 1);
    let instant = local.getTime();
    for (let i = 0; i < 3; i++)
      instant += local.getTime() - wall(new Date(instant));
    return new Date(instant).toISOString();
  } catch {
    return null;
  }
}
