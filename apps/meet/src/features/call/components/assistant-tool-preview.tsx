'use client';
import { useLocale } from 'next-intl';
export function AssistantToolPreview({
  input,
  timezone,
}: {
  input: unknown;
  timezone: string;
}) {
  const locale = useLocale();
  const fields: Array<[string, unknown]> =
    input && typeof input === 'object' && !Array.isArray(input)
      ? Object.entries(input)
      : [['value', input]];
  const format = (value: unknown): string => {
    if (typeof value === 'string') {
      if (
        /^\d{4}-\d{2}-\d{2}T/u.test(value) &&
        /(?:Z|[+-]\d{2}:\d{2})$/iu.test(value) &&
        Number.isFinite(Date.parse(value))
      ) {
        const formatted = new Intl.DateTimeFormat(locale, {
          timeZone: timezone,
          dateStyle: 'medium',
          timeStyle: 'long',
        }).format(new Date(value));
        return `${formatted} (${value})`;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(format).join(', ');
    if (value && typeof value === 'object')
      return JSON.stringify(value, null, 2);
    return String(value ?? '—');
  };
  return (
    <dl className="divide-y rounded-lg border bg-muted/20 px-3">
      {fields.map(([name, value]) => (
        <div
          key={name}
          className="grid gap-1 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3"
        >
          <dt className="font-medium text-muted-foreground text-xs capitalize">
            {name.replaceAll('_', ' ')}
          </dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-sm">
            {format(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
