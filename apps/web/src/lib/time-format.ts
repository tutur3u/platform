/**
 * Time formatting utilities for time tracking
 * Shared formatting functions used across time tracking components
 */

/**
 * Formats seconds into HH:MM:SS or MM:SS format
 * Used for displaying elapsed time in timer displays
 * @param seconds - Number of seconds to format
 * @returns Formatted time string (HH:MM:SS or MM:SS)
 *
 * @example
 * formatTime(125) // "02:05"
 * formatTime(3661) // "01:01:01"
 */
export const formatTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Formats seconds into HH:MM:SS or MM:SS format
 * Used for displaying session durations
 * @param seconds - Number of seconds to format (can be undefined)
 * @returns Formatted duration string (HH:MM:SS or MM:SS)
 *
 * @example
 * formatDuration(125) // "02:05"
 * formatDuration(3661) // "01:01:01"
 * formatDuration(undefined) // "00:00"
 */
export const formatDuration = (seconds: number | undefined): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
