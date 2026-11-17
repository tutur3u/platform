/// Reads launch preferences together, preserving theme-dependent chrome.
/// All work settles before returning so the first frame has its haptic policy,
/// system chrome, and restored destination ready.
Future<({T themeMode, String? initialRoute})> loadStartupPreferences<T>({
  required Future<void> Function() initializeHaptics,
  required Future<T> Function() loadTheme,
  required Future<void> Function(T theme) configureChrome,
  required Future<String?> Function() loadTabRoute,
  required Future<String?> Function() loadAppRoute,
}) async {
  late T theme;
  String? tabRoute;
  String? appRoute;
  await Future.wait<void>([
    () async {
      await initializeHaptics();
    }(),
    () async {
      theme = await loadTheme();
      await configureChrome(theme);
    }(),
    () async {
      tabRoute = await loadTabRoute();
    }(),
    () async {
      appRoute = await loadAppRoute();
    }(),
  ]);
  return (themeMode: theme, initialRoute: tabRoute ?? appRoute);
}
