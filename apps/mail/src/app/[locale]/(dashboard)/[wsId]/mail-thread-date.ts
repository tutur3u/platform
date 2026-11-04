/** Today shows the time, this year the day, older mail includes the year. */
export function formatMailThreadDate(
  value: string | null,
  locale: string,
  now = new Date()
) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay = sameYear && date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    locale,
    sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : sameYear
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' }
  ).format(date);
}

/** Full timestamp for the date's tooltip. */
export function formatMailThreadDateTitle(
  value: string | null,
  locale: string
) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
