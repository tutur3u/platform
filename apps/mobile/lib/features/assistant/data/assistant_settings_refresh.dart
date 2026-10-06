/// A failed identity refresh must not strand local mode or report success.
/// Every continuation belongs to the same settings route and actor lease.
Future<void> refreshAssistantSettings({
  required Future<void> Function() refreshSoul,
  required bool Function() isCurrent,
  required void Function() onRefreshFailure,
  required Future<void> Function() reloadPreferences,
  required void Function() resume,
}) async {
  if (!isCurrent()) return;
  try {
    await refreshSoul();
  } on Object {
    if (!isCurrent()) return;
    onRefreshFailure();
  }
  if (!isCurrent()) return;
  await reloadPreferences();
  if (!isCurrent()) return;
  resume();
}
