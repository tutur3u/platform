export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatTime(timestamp: number): string {
  if (!timestamp) return '--:--';
  return new Date(timestamp).toLocaleTimeString();
}

export function calculateEstimatedTime(
  completedPages: number,
  totalPages: number,
  startTime: number
): string {
  if (completedPages === 0 || !startTime) return '--:--';

  const elapsed = Date.now() - startTime;
  const avgTimePerPage = elapsed / completedPages;
  const remainingPages = totalPages - completedPages;
  const estimatedRemaining = avgTimePerPage * remainingPages;

  return formatDuration(Math.max(0, estimatedRemaining));
}
