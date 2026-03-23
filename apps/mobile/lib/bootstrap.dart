import 'dart:async';
import 'dart:developer';

import 'package:bloc/bloc.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';

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
  FutureOr<Widget> Function({
    String? initialRoute,
    bool? hasSeenOnboarding,
  })
  builder,
) async {
  WidgetsFlutterBinding.ensureInitialized();

  // Ensure system UI is visible and properly configured
  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.edgeToEdge,
  );
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Color(0x00000000),
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Color(0x00000000),
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  FlutterError.onError = (details) {
    log(details.exceptionAsString(), stackTrace: details.stack);
  };

  Bloc.observer = const AppBlocObserver();

  // Initialize Supabase with secure storage
  try {
    await initSupabase();
  } on Object catch (e, st) {
    log('Failed to initialize Supabase: $e', stackTrace: st);
  }

  // Pre-load the user's last routes so the router starts there directly.
  // Prefer the more specific tab route if it's a sub-route of a mini-app,
  // otherwise fall back to the app route or generic tab route.
  final lastTabRoute = await SettingsRepository().getLastTabRoute();
  final lastAppRoute = await SettingsRepository().getLastAppRoute();
  // Use lastTabRoute if it's more specific (e.g., /timer/history vs /timer)
  // otherwise fall back to lastAppRoute or lastTabRoute
  final initialRoute = lastTabRoute ?? lastAppRoute;
  final hasSeenOnboarding = await SettingsRepository().hasSeenOnboarding();

  runApp(
    await builder(
      initialRoute: initialRoute,
      hasSeenOnboarding: hasSeenOnboarding,
    ),
  );
}
