String? formatMeetRemainingTime(DateTime? deadline) {
  if (deadline == null) return null;
  final seconds = deadline.difference(DateTime.now()).inSeconds.clamp(0, 86400);
  final minutes = seconds ~/ 60;
  final hours = (minutes ~/ 60).toString().padLeft(2, '0');
  final mins = (minutes % 60).toString().padLeft(2, '0');
  final secs = (seconds % 60).toString().padLeft(2, '0');
  return '$hours:$mins:$secs';
}
