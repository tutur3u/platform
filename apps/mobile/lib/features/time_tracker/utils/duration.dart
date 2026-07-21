String formatTimerDuration(
  Duration duration, {
  required String invalidDurationLabel,
}) {
  if (duration.isNegative) {
    return invalidDurationLabel;
  }

  final hours = duration.inHours;
  final minutes = duration.inMinutes % 60;
  final seconds = duration.inSeconds % 60;

  if (hours > 0) return '${hours}h ${minutes}m';
  if (minutes > 0) return '${minutes}m ${seconds}s';
  return '${seconds}s';
}
