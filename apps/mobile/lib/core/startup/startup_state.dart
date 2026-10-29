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
