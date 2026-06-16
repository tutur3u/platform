const minTimeTrackerHistoryYear = 1970;
const maxTimeTrackerHistoryYear = 2100;

DateTime? normalizeTimeTrackerHistoryAnchorDate(DateTime? value) {
  if (value == null) return null;

  final local = value.toLocal();
  if (local.year < minTimeTrackerHistoryYear ||
      local.year > maxTimeTrackerHistoryYear) {
    return null;
  }

  return DateTime(local.year, local.month, local.day);
}

DateTime resolveTimeTrackerHistoryAnchorDate(DateTime? value) {
  return normalizeTimeTrackerHistoryAnchorDate(value) ??
      normalizeTimeTrackerHistoryAnchorDate(DateTime.now())!;
}
