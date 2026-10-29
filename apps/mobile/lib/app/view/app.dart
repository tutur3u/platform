import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, ThemeData, ThemeMode;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/app/view/auth_session_boundary.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/deep_link_launcher.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/startup/optional_startup.dart';
import 'package:mobile/core/startup/startup_state.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/education_access_repository.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/repositories/habits_access_repository.dart';
import 'package:mobile/data/repositories/inventory_access_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/version_check_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/view/app_version_gate.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/bridge/app_assistant_client_action_bridge.dart';
import 'package:mobile/features/assistant/bridge/assistant_client_actions.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/audience_mode/audience_mode_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/desktop_update/desktop_uri_receipt.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_auth_reset.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/notifications/data/archive_opened_notification.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/mfa_approval/view/mfa_approval_listener.dart';
import 'package:mobile/features/security/view/app_lock_boundary.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_state.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:mobile/features/settings/data/account_appearance_repository.dart';
import 'package:mobile/features/settings/view/calendar_timezone_scope.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/utils/task_board_navigation.dart';
import 'package:mobile/features/tasks_boards/cubit/task_boards_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_cubit.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_controller.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'app_push_navigation.dart';
part 'app_inventory_warmup.dart';
part 'app_offline_preparation.dart';

class App extends StatefulWidget {
  const App({
    required this.appFlavor,
    this.initialRoute,
    this.initialThemeMode = shad.ThemeMode.system,
    this.initialAppearance = const AppearanceSettings(),
    super.key,
  });

  final AppFlavor appFlavor;

  /// Shell route to start on (loaded from SharedPreferences in bootstrap).
  final String? initialRoute;
  final shad.ThemeMode initialThemeMode;

  /// Appearance customisation loaded in bootstrap to avoid a theme flash.
  final AppearanceSettings initialAppearance;

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  late final AuthRepository _authRepo;
  late final WorkspaceRepository _workspaceRepo;
  late final SettingsRepository _settingsRepo;
  late final VersionCheckRepository _versionCheckRepository;
  late final TaskRepository _taskRepository;
  late final CalendarRepository _calendarRepository;
  late final EducationAccessRepository _educationAccessRepository;
  late final FinanceRepository _financeRepository;
  late final HabitsAccessRepository _habitsAccessRepository;
  late final InventoryAccessRepository _inventoryAccessRepository;
  late final InventoryRepository _inventoryRepository;
  late final TimeTrackerRepository _timeTrackerRepository;
  late final ProfileRepository _profileRepository;
  late final AssistantRepository _assistantRepository;
  late final AuthCubit _authCubit;
  late final AppVersionCubit _appVersionCubit;
  late final WorkspaceCubit _workspaceCubit;
  late final LocaleCubit _localeCubit;
  late final ThemeCubit _themeCubit;
  late final void Function() _unregisterAssistantActions;
  late final CalendarSettingsCubit _calendarSettingsCubit;
  late final ExperimentalAppsCubit _experimentalAppsCubit;
  late final FinancePreferencesCubit _financePreferencesCubit;
  late final AppLockCubit _appLockCubit;
  late final HabitsAccessCubit _habitsAccessCubit;
  late final EducationAccessCubit _educationAccessCubit;
  late final MastermindRuntime _mastermind;
  late final AudienceModeCubit _audienceModeCubit;
  late final InventoryAccessCubit _inventoryAccessCubit;
  late final AppTabCubit _appTabCubit;
  late final ShellChromeActionsCubit _shellChromeActionsCubit;
  late final ShellMiniNavCubit _shellMiniNavCubit;
  late final ShellProfileCubit _shellProfileCubit;
  late final ShellTitleOverrideCubit _shellTitleOverrideCubit;
  late final PomodoroController _pomodoroController;
  late final AppLinks _appLinks;
  late final GoRouter _router;
  late final _AppLifecycleObserver _lifecycleObserver;
  StreamSubscription<Uri>? _appLinkSubscription;
  MobileDeepLink? _pendingDeepLink;
  DateTime? _backgroundedAt;

  @override
  void initState() {
    super.initState();
    _authRepo = AuthRepository();
    _workspaceRepo = WorkspaceRepository();
    _settingsRepo = SettingsRepository();
    _versionCheckRepository = VersionCheckRepository();
    _taskRepository = TaskRepository();
    _calendarRepository = CalendarRepository();
    _educationAccessRepository = EducationAccessRepository();
    _financeRepository = FinanceRepository();
    _inventoryRepository = InventoryRepository();
    _habitsAccessRepository = HabitsAccessRepository();
    _inventoryAccessRepository = InventoryAccessRepository();
    _timeTrackerRepository = TimeTrackerRepository();
    _profileRepository = ProfileRepository(
      ownsApiClient: true,
      ownsHttpClient: true,
    );
    _assistantRepository = AssistantRepository();
    PushNotificationService.instance.configure(
      appFlavor: widget.appFlavor,
      settingsRepository: _settingsRepo,
      onOpen: _handlePushNavigation,
    );
    // Local-notification, FCM and token setup is not needed to paint; it runs
    // once the first frame is out. Sign-in changes still start sessions now.
    scheduleOptionalStartup(_startPushAfterFirstFrame);
    _authCubit = AuthCubit(
      authRepository: _authRepo,
      onBeforeSignOut: () async {
        await ReminderService.instance.stopSession();
        await PushNotificationService.instance.stopSession();
      },
    );
    _appVersionCubit = AppVersionCubit(
      versionCheckRepository: _versionCheckRepository,
      settingsRepository: _settingsRepo,
    );
    _workspaceCubit = WorkspaceCubit(workspaceRepository: _workspaceRepo);
    _localeCubit = LocaleCubit(settingsRepository: _settingsRepo);
    _themeCubit = ThemeCubit(
      settingsRepository: _settingsRepo,
      accountAppearanceRepository: AccountAppearanceRepository(),
      initialThemeMode: widget.initialThemeMode,
      initialAppearance: widget.initialAppearance,
    );
    unawaited(_themeCubit.bindAccount(_appearanceAccountId(_authCubit.state)));
    _calendarSettingsCubit = CalendarSettingsCubit();
    _experimentalAppsCubit = ExperimentalAppsCubit(
      settingsRepository: _settingsRepo,
    );
    _financePreferencesCubit = FinancePreferencesCubit(
      settingsRepository: _settingsRepo,
    );
    _appLockCubit = AppLockCubit(
      localAuthService: DeviceLocalAuthService(),
      settingsStore: SecureStorageAppLockSettingsStore(),
    );
    _habitsAccessCubit = HabitsAccessCubit(repository: _habitsAccessRepository);
    _educationAccessCubit = EducationAccessCubit(
      repository: _educationAccessRepository,
    );
    _audienceModeCubit = AudienceModeCubit(
      repository: AudienceModeRepository(),
    );
    _inventoryAccessCubit = InventoryAccessCubit(
      repository: _inventoryAccessRepository,
    );
    _mastermind = MastermindRuntime.create(
      userId: () => _authCubit.state.user?.id,
    );
    _appTabCubit = AppTabCubit(settingsRepository: _settingsRepo);
    _shellChromeActionsCubit = ShellChromeActionsCubit();
    _shellMiniNavCubit = ShellMiniNavCubit();
    _shellProfileCubit = ShellProfileCubit(
      profileRepository: _profileRepository,
    );
    _shellTitleOverrideCubit = ShellTitleOverrideCubit();
    _pomodoroController = PomodoroController(
      repository: _timeTrackerRepository,
      loadSettings: _timeTrackerRepository.loadPomodoroSettings,
      notificationCopy: _pomodoroNotificationCopy,
    );
    _appLinks = AppLinks();
    _lifecycleObserver = _AppLifecycleObserver(_handleLifecycleState);
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
    _registerWarmupTasks();
    _registerOfflinePreparation();
    unawaited(_appTabCubit.loadLastApp());
    _router = createAppRouter(
      _authCubit,
      _workspaceCubit,
      _habitsAccessCubit,
      _educationAccessCubit,
      _inventoryAccessCubit,
      _appTabCubit,
      mastermindAccessCubit: _mastermind.access,
      initialLocation: widget.initialRoute,
    );
    _unregisterAssistantActions = AssistantClientActions.register(
      AppAssistantClientActionBridge(
        go: _router.go,
        setTheme: (theme, isCurrent) => _themeCubit.setThemeMode(
          ThemeCubit.parseThemeMode(theme),
          isCurrent: isCurrent,
        ),
        currentWorkspaceId: () => _workspaceCubit.state.currentWorkspace?.id,
        currentActorId: () => _authCubit.state.user?.id,
      ),
    );
    _initializeDeepLinks();
    unawaited(_localeCubit.loadLocale());
    unawaited(_calendarSettingsCubit.loadUserPreference());
    unawaited(_experimentalAppsCubit.load());
    unawaited(_financePreferencesCubit.load());
    unawaited(
      _appLockCubit.load(
        lockIfEnabled: _authCubit.state.status == AuthStatus.authenticated,
      ),
    );
    unawaited(_appVersionCubit.checkVersion());
    // BlocListener misses initial auth; load synchronously resolved workspaces.
    if (_authCubit.state.status == AuthStatus.authenticated) {
      unawaited(_pomodoroController.restore(_authCubit.state.user!.id));
      _shellProfileCubit.primeFromAuthenticatedUser(_authCubit.state.user!);
      unawaited(
        _shellProfileCubit.loadFromAuthenticatedUser(_authCubit.state.user!),
      );
      unawaited(_loadWorkspacesWithReminders());
    }
    _bindAudienceMode();
  }

  /// Initializes push, and starts the session if still signed in.
  ///
  /// Reads auth when it runs, so a sign-out or account switch before the first
  /// frame never registers a stale token.
  Future<void> _startPushAfterFirstFrame() async {
    if (!mounted) return;
    await startPushForCurrentAccount(
      currentUserId: () => _appearanceAccountId(_authCubit.state),
      initialize: PushNotificationService.instance.initialize,
      startSession: PushNotificationService.instance.startSession,
    );
  }

  /// The mode belongs to one account in one workspace.
  void _bindAudienceMode() {
    final auth = _authCubit.state;
    unawaited(
      _audienceModeCubit.bind(
        userId: auth.status == AuthStatus.authenticated ? auth.user?.id : null,
        wsId: _workspaceCubit.state.currentWorkspace?.id,
      ),
    );
  }

  static String? _appearanceAccountId(AuthState state) =>
      state.status == AuthStatus.authenticated ? state.user?.id : null;

  String _currentMatchedLocation() {
    final configuration = _router.routerDelegate.currentConfiguration;
    if (configuration.matches.isEmpty) {
      return configuration.uri.path;
    }
    return configuration.matches.last.matchedLocation;
  }

  void _initializeDeepLinks() {
    unawaited(_handleInitialDeepLink());
    _appLinkSubscription = _appLinks.uriLinkStream.listen(
      (uri) => unawaited(_handleDeepLinkUri(uri)),
      onError: (Object error, StackTrace stackTrace) {
        if (kDebugMode) {
          debugPrint('Failed to receive app link: $error');
        }
      },
    );
  }

  Future<void> _handleInitialDeepLink() async {
    try {
      final uri = await _appLinks.getInitialLink();
      if (uri != null) {
        await _handleDeepLinkUri(uri);
      }
    } on Object catch (error) {
      if (kDebugMode) {
        debugPrint('Failed to resolve initial app link: $error');
      }
    }
  }

  Future<void> _handleDeepLinkUri(Uri uri) async {
    if (await recordDesktopSmokeUri(uri)) return;
    final deepLink = resolveMobileDeepLink(uri);
    if (deepLink == null) return;

    if (deepLink.openExternally) {
      await launchExternalMobileDeepLink(uri);
      return;
    }

    _pendingDeepLink = deepLink;
    await _openPendingDeepLinkIfReady();
  }

  Future<void> _openPendingDeepLinkIfReady() async {
    final deepLink = _pendingDeepLink;
    if (deepLink == null) return;
    if (_authCubit.state.status != AuthStatus.authenticated) return;

    final canOpen = await _selectWorkspaceForDeepLink(deepLink);
    if (!canOpen) return;

    _pendingDeepLink = null;
    _router.go(deepLink.location);
  }

  Future<bool> _selectWorkspaceForDeepLink(MobileDeepLink deepLink) async {
    final workspaceSlug = deepLink.workspaceSlug?.trim();
    if (workspaceSlug == null || workspaceSlug.isEmpty) {
      return true;
    }

    if (_workspaceCubit.state.workspaces.isEmpty ||
        _workspaceCubit.state.status != WorkspaceStatus.loaded) {
      await _workspaceCubit.loadWorkspaces();
    }

    final targetWorkspace = _workspaceForSlug(workspaceSlug);
    if (targetWorkspace == null) {
      _pendingDeepLink = null;
      _router.go(Routes.workspaceSelect);
      return false;
    }

    if (_workspaceCubit.state.currentWorkspace?.id != targetWorkspace.id) {
      await _workspaceCubit.selectWorkspace(targetWorkspace);
    }

    return true;
  }

  Workspace? _workspaceForSlug(String workspaceSlug) {
    final normalized = workspaceSlug.trim();
    for (final workspace in _workspaceCubit.state.workspaces) {
      if (normalized == workspace.id) {
        return workspace;
      }
      if (normalized == 'personal' && workspace.personal) {
        return workspace;
      }
    }
    return null;
  }

  /// Notification copy for the phase that just ended, in the app's locale.
  ({String title, String body}) _pomodoroNotificationCopy(PomodoroPhase ended) {
    final preferred =
        _localeCubit.state.locale ??
        WidgetsBinding.instance.platformDispatcher.locale;
    final l10n = lookupAppLocalizations(
      AppLocalizations.supportedLocales.any(
            (locale) => locale.languageCode == preferred.languageCode,
          )
          ? Locale(preferred.languageCode)
          : const Locale('en'),
    );
    return ended == PomodoroPhase.focus
        ? (
            title: l10n.timerPomodoroFocusDoneTitle,
            body: l10n.timerPomodoroFocusDoneBody,
          )
        : (
            title: l10n.timerPomodoroBreakDoneTitle,
            body: l10n.timerPomodoroBreakDoneBody,
          );
  }

  @override
  void dispose() {
    _unregisterAssistantActions();
    _unregisterOfflinePreparation();
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    unawaited(_appLinkSubscription?.cancel());
    _router.dispose();
    unawaited(_authCubit.close());
    unawaited(_appVersionCubit.close());
    unawaited(_workspaceCubit.close());
    unawaited(_localeCubit.close());
    unawaited(_themeCubit.close());
    unawaited(_calendarSettingsCubit.close());
    unawaited(_experimentalAppsCubit.close());
    unawaited(_financePreferencesCubit.close());
    unawaited(_appLockCubit.close());
    unawaited(_habitsAccessCubit.close());
    unawaited(_educationAccessCubit.close());
    unawaited(_audienceModeCubit.close());
    unawaited(_inventoryAccessCubit.close());
    unawaited(_mastermind.close());
    _inventoryRepository.dispose();
    unawaited(_appTabCubit.close());
    unawaited(_shellChromeActionsCubit.close());
    unawaited(_shellMiniNavCubit.close());
    unawaited(_shellProfileCubit.close());
    unawaited(_shellTitleOverrideCubit.close());
    unawaited(_pomodoroController.close());
    unawaited(PushNotificationService.instance.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _authCubit),
        BlocProvider.value(value: _appVersionCubit),
        BlocProvider.value(value: _workspaceCubit),
        BlocProvider.value(value: _localeCubit),
        BlocProvider.value(value: _themeCubit),
        BlocProvider.value(value: _calendarSettingsCubit),
        BlocProvider.value(value: _experimentalAppsCubit),
        BlocProvider.value(value: _financePreferencesCubit),
        BlocProvider.value(value: _appLockCubit),
        BlocProvider.value(value: _habitsAccessCubit),
        BlocProvider.value(value: _educationAccessCubit),
        BlocProvider.value(value: _audienceModeCubit),
        BlocProvider.value(value: _inventoryAccessCubit),
        BlocProvider.value(value: _mastermind.access),
        BlocProvider.value(value: _mastermind.snapshot),
        RepositoryProvider.value(value: _mastermind),
        BlocProvider.value(value: _appTabCubit),
        BlocProvider.value(value: _shellChromeActionsCubit),
        BlocProvider.value(value: _shellMiniNavCubit),
        BlocProvider.value(value: _shellProfileCubit),
        BlocProvider.value(value: _shellTitleOverrideCubit),
        BlocProvider.value(value: _pomodoroController),
      ],
      child: CalendarTimezoneScope(
        child: MultiBlocListener(
          listeners: [
            BlocListener<AuthCubit, AuthState>(
              listenWhen: (prev, curr) =>
                  prev.status != curr.status || prev.user?.id != curr.user?.id,
              listener: (context, state) {
                _syncOfflinePreparationScope(resetWorkspace: true);
                _bindAudienceMode();
                ProfileCubit.clearMemoryCache();
                // Appearance follows the account unless this device overrides.
                unawaited(_themeCubit.bindAccount(_appearanceAccountId(state)));
                // The device Pomodoro belongs to one account.
                unawaited(_pomodoroController.restore(state.user?.id));
                if (state.status == AuthStatus.authenticated) {
                  unawaited(
                    PushNotificationService.instance.startSession(
                      state.user!.id,
                    ),
                  );
                  context.read<ShellProfileCubit>().primeFromAuthenticatedUser(
                    state.user!,
                  );
                  unawaited(
                    context.read<ShellProfileCubit>().loadFromAuthenticatedUser(
                      state.user!,
                    ),
                  );
                  unawaited(
                    context.read<AppLockCubit>().load(lockIfEnabled: true),
                  );
                  unawaited(_loadWorkspacesWithReminders());
                  unawaited(_openPendingDeepLinkIfReady());
                } else if (state.status == AuthStatus.unauthenticated) {
                  unawaited(ReminderService.instance.stopSession());
                  context.read<AppLockCubit>().resetLockState();
                  unawaited(context.read<ShellProfileCubit>().clear());
                  unawaited(context.read<WorkspaceCubit>().clearWorkspaces());
                }
              },
            ),
            mastermindAuthResetListener(_mastermind),
            BlocListener<WorkspaceCubit, WorkspaceState>(
              listenWhen: (previous, current) =>
                  previous.currentWorkspace?.id != current.currentWorkspace?.id,
              listener: (context, state) {
                _syncOfflinePreparationScope();
                _bindAudienceMode();
                unawaited(
                  _mastermind.access.syncWorkspace(state.currentWorkspace?.id),
                );
                unawaited(
                  context.read<HabitsAccessCubit>().syncWorkspace(
                    state.currentWorkspace?.id,
                  ),
                );
                unawaited(
                  context.read<EducationAccessCubit>().syncWorkspace(
                    state.currentWorkspace?.id,
                  ),
                );
                unawaited(
                  context.read<InventoryAccessCubit>().syncWorkspace(
                    state.currentWorkspace?.id,
                  ),
                );
                if (state.currentWorkspace == null) {
                  return;
                }
                final userId = context.read<AuthCubit>().state.user?.id;
                if (userId != null) {
                  unawaited(
                    ReminderService.instance.startWorkspaceSession(
                      userId,
                      state,
                    ),
                  );
                }
                unawaited(
                  context.read<AuthCubit>().updateActiveAccountWorkspaceContext(
                    state.currentWorkspace!.id,
                  ),
                );
                unawaited(CacheWarmupCoordinator.instance.prewarmBoot());
                unawaited(_openPendingDeepLinkIfReady());
              },
            ),
          ],
          child: BlocBuilder<LocaleCubit, LocaleState>(
            builder: (context, localeState) {
              return BlocBuilder<ThemeCubit, ThemeState>(
                builder: (context, themeState) {
                  final appearance = themeState.appearance;
                  return shad.ShadcnApp.router(
                    debugShowCheckedModeBanner: false,
                    theme: AppearanceTheme.shadTheme(
                      appearance,
                      Brightness.light,
                    ),
                    darkTheme: AppearanceTheme.shadTheme(
                      appearance,
                      Brightness.dark,
                    ),
                    themeMode: themeState.themeMode,
                    locale: localeState.locale,
                    localizationsDelegates: const [
                      ...AppLocalizations.localizationsDelegates,
                      AppShadcnLocalizationsDelegate(),
                    ],
                    supportedLocales: AppLocalizations.supportedLocales,
                    routerConfig: _router,
                    builder: (context, child) {
                      final authIdentity = context.select<AuthCubit, String?>(
                        (cubit) => cubit.state.user?.id,
                      );
                      return AppearanceBackdrop(
                        settings: appearance,
                        child: ShadcnMaterialBridge(
                          child: AuthSessionBoundary(
                            identity: authIdentity,
                            child: DismissKeyboardOnPointerDown(
                              child: AppLockBoundary(
                                excluded: isAppLockExcludedRoute(
                                  _currentMatchedLocation(),
                                ),
                                child: MobileMfaApprovalListener(
                                  child: AppVersionGate(child: child!),
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}
