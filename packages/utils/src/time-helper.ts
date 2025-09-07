// Utility function to parse time from timetz format (e.g., "09:00:00+00")
// Converts hour 0 to 24 to support 1-24 hour format used in the application
export const parseTimeFromTimetz = (
  timetz: string | undefined
): number | undefined => {
  if (!timetz) return undefined;

  // Validate basic format before splitting
  if (!timetz.includes(':')) return undefined;

  const timePart = timetz.split(':')[0];
  if (!timePart) return undefined;

  const hour = parseInt(timePart, 10);

  // Validate hour is a valid number and in expected range
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return undefined;

  // Convert 0 to 24 for comparison (which uses 1-24 format)
  return hour === 0 ? 24 : hour;
};
