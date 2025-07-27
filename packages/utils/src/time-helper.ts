// Utility function to parse time from timetz format (e.g., "09:00:00+00")
export const parseTimeFromTimetz = (
    timetz: string | undefined
  ): number | undefined => {
    if (!timetz) return undefined;
    const timePart = timetz.split(':')[0];
    if (!timePart) return undefined;
    const hour = parseInt(timePart, 10);
    // Convert 0 to 24 for comparison (which uses 1-24 format)
    return hour === 0 ? 24 : hour;
  };

  