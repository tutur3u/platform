export function taskDurationHoursToMinutes(durationHours: number | null) {
  if (!durationHours || durationHours <= 0) return 0;
  return Math.round(durationHours * 60);
}

export function taskDurationMinutesToHours(durationMinutes: number) {
  if (durationMinutes <= 0) return null;
  return Number((durationMinutes / 60).toFixed(2));
}

export function formatTaskDurationLabel(durationHours: number | null) {
  const totalMinutes = taskDurationHoursToMinutes(durationHours);
  if (totalMinutes <= 0) return null;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
