import 'dart:async';
import 'dart:developer';
import 'dart:io';
import 'dart:ui';

import 'package:bloc/bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/config/firebase_options_selector.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/startup/optional_startup.dart';
import 'package:mobile/core/startup/startup_state.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/icons/lucide_licenses.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/assistant/local/assistant_model_downloads.dart';
import 'package:mobile/features/notifications/push/push_background_handler.dart';
import 'package:mobile/features/settings/cubit/appearance_resolution.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppBlocObserver extends BlocObserver {
  const AppBlocObserver({required this.logChanges});

  final bool logChanges;

  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    if (logChanges) log('onChange(${bloc.runtimeType}, $change)');
  }

  @override
  void onError(BlocBase<dynamic> bloc, Object error, StackTrace stackTrace) {
    MobileObservability.instance.recordNonFatal('bloc', error, stackTrace);
    if (logChanges) {
      log('onError(${bloc.runtimeType}, $error, $stackTrace)');
    }
    super.onError(bloc, error, stackTrace);
  }
}

Future<void> bootstrap(
  AppFlavor appFlavor,
  FutureOr<Widget> Function({
    required AppFlavor appFlavor,
    required shad.ThemeMode initialThemeMode,
    required AppearanceSettings initialAppearance,
    String? initialRoute,
  })
  builder,
) async {
  WidgetsFlutterBinding.ensureInitialized();
  // Release builds must never fall back to cleartext localhost backends.
  Env.assertSecureForRelease();
  registerLucideLicenses();
  ApiConfig.configure(appFlavor);

  FlutterError.onError = (details) {
    MobileObservability.instance.recordFatal(
      'flutter_framework',
      details.exception,
      details.stack,
    );
  };

  Bloc.observer = AppBlocObserver(
    logChanges: appFlavor != AppFlavor.production,
  );

  final settingsRepository = SettingsRepository();
  // Firebase is the longest required platform call and does not depend on
  // local preferences, so both start together and join before Supabase.
  final preferences = await initializeBootstrapServices<_LocalPreferences>(
    initializePlatformServices: () async {
      try {
        await Firebase.initializeApp(
          options: firebaseOptionsForFlavor(appFlavor),
        );
        FirebaseMessaging.onBackgroundMessage(
          firebaseMessagingBackgroundHandler,
        );
        await MobileObservability.instance.initialize(appFlavor);
        PlatformDispatcher.instance.onError = (error, stack) =>
            MobileObservability.instance.recordFatal('platform', error, stack);
      } on Object catch (e, st) {
        log('Failed to initialize Firebase: $e', stackTrace: st);
      }
    },
    loadLocalPreferences: () => _loadLocalPreferences(settingsRepository),
  );
  final initialThemeMode = preferences.themeMode;

  // Supabase starts only after the platform error handler is installed, so
  // session restoration stays covered by crash reporting.
  try {
    await initSupabase();
  } on Object catch (e, st) {
    log('Failed to initialize Supabase: $e', stackTrace: st);
  }

  // Identity and error handlers are ready. Appearance reads do not depend on
  // the offline store; queue restoration still requires that store to be ready.
  final initialAppearance = await initializeStartupState(
    loadAppearance: () async {
      try {
        return (await StoredAppearance.read(
          settingsRepository,
          userId: _currentUserIdOrNull(),
        )).resolved;
      } on Object catch (e, st) {
        log('Failed to load appearance, using default: $e', stackTrace: st);
        return const AppearanceSettings();
      }
    },
    initializeCache: () async {
      await CacheStore.instance.init();
    },
    restoreMutations: () async {
      await OfflineMutationQueue.instance.init();
    },
    onCacheError: (e, st) {
      log('Failed to initialize offline cache: $e', stackTrace: st);
    },
  );

  runApp(
    await builder(
      appFlavor: appFlavor,
      initialRoute: preferences.initialRoute,
      initialThemeMode: initialThemeMode,
      initialAppearance: initialAppearance,
    ),
  );
  if (Platform.isAndroid || Platform.isIOS) {
    // Keep native transfer recovery and disk checks after first paint.
    // Settings still exposes failures and permits a fresh initialization retry.
    scheduleOptionalStartup(AssistantModelDownloads.instance.initialize);
  }
}

typedef _LocalPreferences = ({shad.ThemeMode themeMode, String? initialRoute});

/// Reads the local settings the first frame needs and applies system chrome.
///
/// Does not touch Firebase or Supabase, so it can overlap their initialization.
Future<_LocalPreferences> _loadLocalPreferences(
  SettingsRepository settingsRepository,
) async {
  await AppHaptics.initialize();

  shad.ThemeMode themeMode;
  try {
    themeMode = _parseThemeMode(await settingsRepository.getThemeMode());
  } on Object catch (e, st) {
    log('Failed to load theme mode, defaulting to system: $e', stackTrace: st);
    themeMode = shad.ThemeMode.system;
  }
  final resolvedBrightness = AppTheme.resolveBrightness(
    themeMode,
    WidgetsBinding.instance.platformDispatcher.platformBrightness,
  );

  // Ensure system UI is visible and properly configured
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(
    AppTheme.systemUiOverlayStyleFor(resolvedBrightness),
  );

  // Pre-load the user's last routes so the router starts there directly.
  // Prefer the more specific tab route if it's a sub-route of a mini-app,
  // otherwise fall back to the app route or generic tab route.
  final lastTabRoute = await settingsRepository.getLastTabRoute();
  final lastAppRoute = await settingsRepository.getLastAppRoute();
  return (themeMode: themeMode, initialRoute: lastTabRoute ?? lastAppRoute);
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

/// The signed-in user whose appearance shows at launch. Like the app, an
/// account still awaiting MFA counts as signed out.
String? _currentUserIdOrNull() {
  try {
    final auth = AuthRepository(supabaseClient: supabase);
    final user = auth.getCurrentUserSync();
    if (user == null || auth.checkMfaRequired()) return null;
    return user.id;
  } on Object {
    // Supabase failed to initialize; start signed out.
    return null;
  }
}
