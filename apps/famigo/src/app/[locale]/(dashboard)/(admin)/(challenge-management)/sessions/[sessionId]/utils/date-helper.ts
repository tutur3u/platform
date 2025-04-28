export function calculateDuration(startDate: Date, endDate: Date): string {
  // Calculate the difference in milliseconds
  const diff = endDate.getTime() - startDate.getTime();

  // Convert to seconds
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) {
    return `${seconds} seconds`;
  }

  // Calculate hours, minutes, seconds
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  // Format the result based on the duration
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}
