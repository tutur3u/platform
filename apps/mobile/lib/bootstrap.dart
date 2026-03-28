import 'dart:async';
import 'dart:developer';

import 'package:bloc/bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/config/firebase_options_selector.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/notifications/push/push_background_handler.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppBlocObserver extends BlocObserver {
  const AppBlocObserver();

  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    log('onChange(${bloc.runtimeType}, $change)');
  }

  @override
  void onError(BlocBase<dynamic> bloc, Object error, StackTrace stackTrace) {
    log('onError(${bloc.runtimeType}, $error, $stackTrace)');
    super.onError(bloc, error, stackTrace);
  }
}

Future<void> bootstrap(
  AppFlavor appFlavor,
  FutureOr<Widget> Function({
    required AppFlavor appFlavor,
    required shad.ThemeMode initialThemeMode,
    String? initialRoute,
  })
  builder,
) async {
  WidgetsFlutterBinding.ensureInitialized();

  final settingsRepository = SettingsRepository();
  shad.ThemeMode initialThemeMode;
  try {
    initialThemeMode = _parseThemeMode(
      await settingsRepository.getThemeMode(),
    );
  } on Object catch (e, st) {
    log(
      'Failed to load theme mode, defaulting to system: $e',
      stackTrace: st,
    );
    initialThemeMode = shad.ThemeMode.system;
  }
  final resolvedBrightness = AppTheme.resolveBrightness(
    initialThemeMode,
    WidgetsBinding.instance.platformDispatcher.platformBrightness,
  );

  // Ensure system UI is visible and properly configured
  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.edgeToEdge,
  );
  SystemChrome.setSystemUIOverlayStyle(
    AppTheme.systemUiOverlayStyleFor(resolvedBrightness),
  );

  FlutterError.onError = (details) {
    log(details.exceptionAsString(), stackTrace: details.stack);
  };

  Bloc.observer = const AppBlocObserver();

  // Initialize Supabase with secure storage
  try {
    await Firebase.initializeApp(
      options: firebaseOptionsForFlavor(appFlavor),
    );
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } on Object catch (e, st) {
    log('Failed to initialize Firebase: $e', stackTrace: st);
  }

  try {
    await initSupabase();
  } on Object catch (e, st) {
    log('Failed to initialize Supabase: $e', stackTrace: st);
  }

  try {
    await CacheStore.instance.init();
    await OfflineMutationQueue.instance.init();
  } on Object catch (e, st) {
    log('Failed to initialize offline cache: $e', stackTrace: st);
  }

  // Pre-load the user's last routes so the router starts there directly.
  // Prefer the more specific tab route if it's a sub-route of a mini-app,
  // otherwise fall back to the app route or generic tab route.
  final lastTabRoute = await settingsRepository.getLastTabRoute();
  final lastAppRoute = await settingsRepository.getLastAppRoute();
  // Use lastTabRoute if it's more specific (e.g., /timer/history vs /timer)
  // otherwise fall back to lastAppRoute or lastTabRoute
  final initialRoute = lastTabRoute ?? lastAppRoute;

  runApp(
    await builder(
      appFlavor: appFlavor,
      initialRoute: initialRoute,
      initialThemeMode: initialThemeMode,
    ),
  );
}

shad.ThemeMode _parseThemeMode(String mode) {
  switch (mode) {
    case 'light':
      return shad.ThemeMode.light;
    case 'dark':
      return shad.ThemeMode.dark;
    case 'system':
    default:
      return shad.ThemeMode.system;
  }
}
