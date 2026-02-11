import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, ThemeData, ThemeMode;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_state.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class App extends StatefulWidget {
  const App({this.initialRoute, super.key});

  /// Shell route to start on (loaded from SharedPreferences in bootstrap).
  final String? initialRoute;

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  late final AuthRepository _authRepo;
  late final WorkspaceRepository _workspaceRepo;
  late final SettingsRepository _settingsRepo;
  late final AuthCubit _authCubit;
  late final WorkspaceCubit _workspaceCubit;
  late final LocaleCubit _localeCubit;
  late final ThemeCubit _themeCubit;
  late final CalendarSettingsCubit _calendarSettingsCubit;
  late final AppTabCubit _appTabCubit;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _authRepo = AuthRepository();
    _workspaceRepo = WorkspaceRepository();
    _settingsRepo = SettingsRepository();
    _authCubit = AuthCubit(authRepository: _authRepo);
    _workspaceCubit = WorkspaceCubit(workspaceRepository: _workspaceRepo);
    _localeCubit = LocaleCubit(settingsRepository: _settingsRepo);
    _themeCubit = ThemeCubit(settingsRepository: _settingsRepo);
    unawaited(_themeCubit.loadThemeMode());
    _calendarSettingsCubit = CalendarSettingsCubit();
    _appTabCubit = AppTabCubit(settingsRepository: _settingsRepo);
    unawaited(_appTabCubit.loadLastApp());
    _router = createAppRouter(
      _authCubit,
      _workspaceCubit,
      _appTabCubit,
      initialLocation: widget.initialRoute,
    );
    unawaited(_localeCubit.loadLocale());
    unawaited(_calendarSettingsCubit.loadUserPreference());
    // If auth resolved synchronously to authenticated, load workspaces now.
    // BlocListener only fires on state *changes*, so it won't trigger for
    // the initial state set in the AuthCubit constructor.
    if (_authCubit.state.status == AuthStatus.authenticated) {
      unawaited(_workspaceCubit.loadWorkspaces());
    }
  }

  @override
  void dispose() {
    _router.dispose();
    unawaited(_authCubit.close());
    unawaited(_workspaceCubit.close());
    unawaited(_localeCubit.close());
    unawaited(_themeCubit.close());
    unawaited(_calendarSettingsCubit.close());
    unawaited(_appTabCubit.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _authCubit),
        BlocProvider.value(value: _workspaceCubit),
        BlocProvider.value(value: _localeCubit),
        BlocProvider.value(value: _themeCubit),
        BlocProvider.value(value: _calendarSettingsCubit),
        BlocProvider.value(value: _appTabCubit),
      ],
      child: BlocListener<AuthCubit, AuthState>(
        listenWhen: (prev, curr) => prev.status != curr.status,
        listener: (context, state) {
          if (state.status == AuthStatus.authenticated) {
            unawaited(context.read<WorkspaceCubit>().loadWorkspaces());
          } else if (state.status == AuthStatus.unauthenticated) {
            unawaited(context.read<WorkspaceCubit>().clearWorkspaces());
          }
        },
        child: BlocBuilder<LocaleCubit, LocaleState>(
          builder: (context, localeState) {
            return BlocBuilder<ThemeCubit, ThemeState>(
              builder: (context, themeState) {
                return shad.ShadcnApp.router(
                  theme: const shad.ThemeData(
                    colorScheme: shad.ColorSchemes.lightZinc,
                  ),
                  darkTheme: const shad.ThemeData.dark(
                    colorScheme: shad.ColorSchemes.darkZinc,
                  ),
                  themeMode: themeState.themeMode,
                  locale: localeState.locale,
                  localizationsDelegates: const [
                    ...AppLocalizations.localizationsDelegates,
                    shad.ShadcnLocalizations.delegate,
                  ],
                  supportedLocales: AppLocalizations.supportedLocales,
                  routerConfig: _router,
                  builder: (context, child) {
                    return _ShadcnMaterialBridge(child: child!);
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _ShadcnMaterialBridge extends StatelessWidget {
  const _ShadcnMaterialBridge({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Theme(
      data: theme.brightness == Brightness.light
          ? AppTheme.light
          : AppTheme.dark,
      child: child,
    );
  }
}
