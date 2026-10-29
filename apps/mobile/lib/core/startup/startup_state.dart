/// Overlaps platform service setup with independent local preference reads.
///
/// [initializePlatformServices] (Firebase and observability) and
/// [loadLocalPreferences] share no state, so neither waits for the other. Both
/// settle before returning, so required work never escapes into the first
/// frame. Identity restoration must still start only after this returns, which
/// keeps platform error handlers installed while the session is restored.
Future<T> initializeBootstrapServices<T>({
  required Future<void> Function() initializePlatformServices,
  required Future<T> Function() loadLocalPreferences,
}) async {
  late T preferences;
  await Future.wait<void>([
    initializePlatformServices(),
    () async {
      preferences = await loadLocalPreferences();
    }(),
  ]);
  return preferences;
}

/// Loads appearance alongside offline state after identity restoration.
///
/// Call only after observability and Supabase initialization have settled.
/// Appearance owns its existing fallback; cache failures are reported once and
/// skip mutation restoration, just as the sequential bootstrap did. Both
/// branches
/// settle before returning, so no required work escapes into the first frame.
Future<T> initializeStartupState<T>({
  required Future<T> Function() loadAppearance,
  required Future<void> Function() initializeCache,
  required Future<void> Function() restoreMutations,
  required void Function(Object, StackTrace) onCacheError,
}) async {
  late T appearance;
  await Future.wait<void>([
    () async {
      appearance = await loadAppearance();
    }(),
    () async {
      try {
        await initializeCache();
        await restoreMutations();
      } on Object catch (error, stack) {
        onCacheError(error, stack);
      }
    }(),
  ]);
  return appearance;
}

/// Brings push up for whoever is signed in when this runs.
///
/// Scheduled after the first frame, so [currentUserId] is read now rather than
/// when scheduling: a sign-out or account switch in between never registers a
/// stale token. A signed-out launch still initializes push so a notification
/// that opened the app is recorded and delivered after sign-in.
Future<void> startPushForCurrentAccount({
  required String? Function() currentUserId,
  required Future<void> Function() initialize,
  required Future<void> Function(String userId) startSession,
}) {
  final userId = currentUserId();
  return userId == null ? initialize() : startSession(userId);
}
