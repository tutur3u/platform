/** datetime-local values are wall-clock time in the user's browser timezone. */
export function normalizeMeetingTime(value: string) {
  return new Date(value).toISOString();
}
