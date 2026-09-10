export function localDateTimeValue(time: number | null) {
  if (time === null) return '';
  const offset = new Date(time).getTimezoneOffset() * 60_000;
  return new Date(time - offset).toISOString().slice(0, 16);
}
