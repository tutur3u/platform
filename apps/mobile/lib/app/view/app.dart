import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, ThemeData, ThemeMode;
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/app/view/auth_session_boundary.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/repositories/habits_access_repository.dart';
import 'package:mobile/data/repositories/inventory_access_repository.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/version_check_repository.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/view/app_version_gate.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_state.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
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
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class App extends StatefulWidget {
  const App({
    required this.appFlavor,
    this.initialRoute,
    this.initialThemeMode = shad.ThemeMode.system,
    super.key,
  });

  final AppFlavor appFlavor;

  /// Shell route to start on (loaded from SharedPreferences in bootstrap).
  final String? initialRoute;
  final shad.ThemeMode initialThemeMode;

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
  late final FinanceRepository _financeRepository;
  late final HabitsAccessRepository _habitsAccessRepository;
  late final InventoryAccessRepository _inventoryAccessRepository;
  late final TimeTrackerRepository _timeTrackerRepository;
  late final ProfileRepository _profileRepository;
  late final AuthCubit _authCubit;
  late final AppVersionCubit _appVersionCubit;
  late final WorkspaceCubit _workspaceCubit;
  late final LocaleCubit _localeCubit;
  late final ThemeCubit _themeCubit;
  late final CalendarSettingsCubit _calendarSettingsCubit;
  late final FinancePreferencesCubit _financePreferencesCubit;
  late final HabitsAccessCubit _habitsAccessCubit;
  late final InventoryAccessCubit _inventoryAccessCubit;
  late final AppTabCubit _appTabCubit;
  late final ShellChromeActionsCubit _shellChromeActionsCubit;
  late final ShellMiniNavCubit _shellMiniNavCubit;
  late final ShellProfileCubit _shellProfileCubit;
  late final ShellTitleOverrideCubit _shellTitleOverrideCubit;
  late final GoRouter _router;
  late final _AppLifecycleObserver _lifecycleObserver;

  @override
  void initState() {
    super.initState();
    _authRepo = AuthRepository();
    _workspaceRepo = WorkspaceRepository();
    _settingsRepo = SettingsRepository();
    _versionCheckRepository = VersionCheckRepository();
    _taskRepository = TaskRepository();
    _calendarRepository = CalendarRepository();
    _financeRepository = FinanceRepository();
    _habitsAccessRepository = HabitsAccessRepository();
    _inventoryAccessRepository = InventoryAccessRepository();
    _timeTrackerRepository = TimeTrackerRepository();
    _profileRepository = ProfileRepository(
      ownsApiClient: true,
      ownsHttpClient: true,
    );
    PushNotificationService.instance.configure(
      appFlavor: widget.appFlavor,
      settingsRepository: _settingsRepo,
      onOpen: _handlePushNavigation,
    );
    unawaited(PushNotificationService.instance.initialize());
    _authCubit = AuthCubit(
      authRepository: _authRepo,
      onBeforeSignOut: PushNotificationService.instance.stopSession,
    );
    _appVersionCubit = AppVersionCubit(
      versionCheckRepository: _versionCheckRepository,
      settingsRepository: _settingsRepo,
    );
    _workspaceCubit = WorkspaceCubit(workspaceRepository: _workspaceRepo);
    _localeCubit = LocaleCubit(settingsRepository: _settingsRepo);
    _themeCubit = ThemeCubit(
      settingsRepository: _settingsRepo,
      initialThemeMode: widget.initialThemeMode,
    );
    _calendarSettingsCubit = CalendarSettingsCubit();
    _financePreferencesCubit = FinancePreferencesCubit(
      settingsRepository: _settingsRepo,
    );
    _habitsAccessCubit = HabitsAccessCubit(repository: _habitsAccessRepository);
    _inventoryAccessCubit = InventoryAccessCubit(
      repository: _inventoryAccessRepository,
    );
    _appTabCubit = AppTabCubit(settingsRepository: _settingsRepo);
    _shellChromeActionsCubit = ShellChromeActionsCubit();
    _shellMiniNavCubit = ShellMiniNavCubit();
    _shellProfileCubit = ShellProfileCubit(
      profileRepository: _profileRepository,
    );
    _shellTitleOverrideCubit = ShellTitleOverrideCubit();
    _lifecycleObserver = _AppLifecycleObserver(() {
      unawaited(_appVersionCubit.checkVersion(background: true));
      unawaited(CacheWarmupCoordinator.instance.prewarmHome());
      unawaited(_shellProfileCubit.refreshIfStale(_authCubit.state.user));
    });
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
    _registerWarmupTasks();
    unawaited(_appTabCubit.loadLastApp());
    _router = createAppRouter(
      _authCubit,
      _workspaceCubit,
      _habitsAccessCubit,
      _inventoryAccessCubit,
      _appTabCubit,
      initialLocation: widget.initialRoute,
    );
    unawaited(_localeCubit.loadLocale());
    unawaited(_calendarSettingsCubit.loadUserPreference());
    unawaited(_financePreferencesCubit.load());
    unawaited(_appVersionCubit.checkVersion());
    // If auth resolved synchronously to authenticated, load workspaces now.
    // BlocListener only fires on state *changes*, so it won't trigger for
    // the initial state set in the AuthCubit constructor.
    if (_authCubit.state.status == AuthStatus.authenticated) {
      unawaited(
        PushNotificationService.instance.startSession(
          _authCubit.state.user!.id,
        ),
      );
      _shellProfileCubit.primeFromAuthenticatedUser(_authCubit.state.user!);
      unawaited(
        _shellProfileCubit.loadFromAuthenticatedUser(_authCubit.state.user!),
      );
      unawaited(_workspaceCubit.loadWorkspaces());
    }
  }

  void _registerWarmupTasks() {
    CacheWarmupCoordinator.instance.register(
      'home_payload',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await Future.wait([
          TaskListCubit.prewarm(
            taskRepository: _taskRepository,
            wsId: workspace.id,
            isPersonal: workspace.personal,
            forceRefresh: forceRefresh,
          ),
          CalendarCubit.prewarm(
            calendarRepository: _calendarRepository,
            wsId: workspace.id,
            forceRefresh: forceRefresh,
          ),
        ]);
      },
    );
    CacheWarmupCoordinator.instance.register(
      'assistant_metadata',
      ({forceRefresh = false}) async {},
    );
    CacheWarmupCoordinator.instance.register(
      'apps_registry',
      ({forceRefresh = false}) async {},
    );
    CacheWarmupCoordinator.instance.register(
      'tasks_list',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await TaskListCubit.prewarm(
          taskRepository: _taskRepository,
          wsId: workspace.id,
          isPersonal: workspace.personal,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'task_boards',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await TaskBoardsCubit.prewarm(
          taskRepository: _taskRepository,
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'task_estimates',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await TaskEstimatesCubit.prewarm(
          taskRepository: _taskRepository,
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'task_labels',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await TaskLabelsCubit.prewarm(
          taskRepository: _taskRepository,
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'task_portfolio',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await TaskPortfolioCubit.prewarm(
          taskRepository: _taskRepository,
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'calendar_root',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await CalendarCubit.prewarm(
          calendarRepository: _calendarRepository,
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'finance_overview',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        await FinanceCubit.prewarm(
          financeRepository: _financeRepository,
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'finance_transactions',
      ({forceRefresh = false}) async {},
    );
    CacheWarmupCoordinator.instance.register(
      'habits_overview',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        final accessState = _habitsAccessCubit.state;
        if (accessState.wsId != workspace.id ||
            accessState.status != HabitsAccessStatus.loaded ||
            !accessState.enabled) {
          return;
        }
        await HabitsCubit.prewarm(
          repository: HabitTrackerRepository(),
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'habits_activity',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        if (workspace == null) return;
        final accessState = _habitsAccessCubit.state;
        if (accessState.wsId != workspace.id ||
            accessState.status != HabitsAccessStatus.loaded ||
            !accessState.enabled) {
          return;
        }
        await HabitsCubit.prewarm(
          repository: HabitTrackerRepository(),
          wsId: workspace.id,
          includeActivity: true,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'time_tracker_root',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        final userId = _authCubit.state.user?.id;
        if (workspace == null || userId == null || userId.isEmpty) return;
        await TimeTrackerCubit.prewarm(
          repository: _timeTrackerRepository,
          wsId: workspace.id,
          userId: userId,
          forceRefresh: forceRefresh,
        );
      },
    );
    CacheWarmupCoordinator.instance.register(
      'time_tracker_requests',
      ({forceRefresh = false}) async {
        final workspace = _workspaceCubit.state.currentWorkspace;
        final userId = _authCubit.state.user?.id;
        if (workspace == null || userId == null || userId.isEmpty) return;
        await TimeTrackerRequestsCubit.prewarm(
          workspace.id,
          repository: _timeTrackerRepository,
          selectedUserId: userId,
          statusFilter: 'pending',
          forceRefresh: forceRefresh,
        );
      },
    );
  }

  Future<void> _handlePushNavigation(PushNavigationRequest request) async {
    final targetWorkspaceId = request.wsId;
    if (targetWorkspaceId != null &&
        targetWorkspaceId.isNotEmpty &&
        _workspaceCubit.state.currentWorkspace?.id != targetWorkspaceId) {
      if (_workspaceCubit.state.workspaces.isEmpty) {
        await _workspaceCubit.loadWorkspaces();
      }

      Workspace? targetWorkspace;
      for (final workspace in _workspaceCubit.state.workspaces) {
        if (workspace.id == targetWorkspaceId) {
          targetWorkspace = workspace;
          break;
        }
      }

      if (targetWorkspace == null) {
        _router.go(Routes.notifications);
        return;
      }

      await _workspaceCubit.selectWorkspace(targetWorkspace);
    }

    if (request.opensTask) {
      _router.go(
        taskBoardDetailLocation(
          boardId: request.boardId!,
          taskId: request.entityId!,
        ),
      );
      return;
    }

    _router.go(Routes.notifications);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    _router.dispose();
    unawaited(_authCubit.close());
    unawaited(_appVersionCubit.close());
    unawaited(_workspaceCubit.close());
    unawaited(_localeCubit.close());
    unawaited(_themeCubit.close());
    unawaited(_calendarSettingsCubit.close());
    unawaited(_financePreferencesCubit.close());
    unawaited(_habitsAccessCubit.close());
    unawaited(_inventoryAccessCubit.close());
    unawaited(_appTabCubit.close());
    unawaited(_shellChromeActionsCubit.close());
    unawaited(_shellMiniNavCubit.close());
    unawaited(_shellProfileCubit.close());
    unawaited(_shellTitleOverrideCubit.close());
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
        BlocProvider.value(value: _financePreferencesCubit),
        BlocProvider.value(value: _habitsAccessCubit),
        BlocProvider.value(value: _inventoryAccessCubit),
        BlocProvider.value(value: _appTabCubit),
        BlocProvider.value(value: _shellChromeActionsCubit),
        BlocProvider.value(value: _shellMiniNavCubit),
        BlocProvider.value(value: _shellProfileCubit),
        BlocProvider.value(value: _shellTitleOverrideCubit),
      ],
      child: MultiBlocListener(
        listeners: [
          BlocListener<AuthCubit, AuthState>(
            listenWhen: (prev, curr) =>
                prev.status != curr.status || prev.user?.id != curr.user?.id,
            listener: (context, state) {
              ProfileCubit.clearMemoryCache();
              if (state.status == AuthStatus.authenticated) {
                unawaited(
                  PushNotificationService.instance.startSession(state.user!.id),
                );
                context.read<ShellProfileCubit>().primeFromAuthenticatedUser(
                  state.user!,
                );
                unawaited(
                  context.read<ShellProfileCubit>().loadFromAuthenticatedUser(
                    state.user!,
                  ),
                );
                unawaited(context.read<WorkspaceCubit>().loadWorkspaces());
              } else if (state.status == AuthStatus.unauthenticated) {
                unawaited(context.read<ShellProfileCubit>().clear());
                unawaited(context.read<WorkspaceCubit>().clearWorkspaces());
              }
            },
          ),
          BlocListener<WorkspaceCubit, WorkspaceState>(
            listenWhen: (previous, current) =>
                previous.currentWorkspace?.id != current.currentWorkspace?.id,
            listener: (context, state) {
              unawaited(
                context.read<HabitsAccessCubit>().syncWorkspace(
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
              unawaited(
                context.read<AuthCubit>().updateActiveAccountWorkspaceContext(
                  state.currentWorkspace!.id,
                ),
              );
              unawaited(CacheWarmupCoordinator.instance.prewarmBoot());
            },
          ),
        ],
        child: BlocBuilder<LocaleCubit, LocaleState>(
          builder: (context, localeState) {
            return BlocBuilder<ThemeCubit, ThemeState>(
              builder: (context, themeState) {
                return shad.ShadcnApp.router(
                  debugShowCheckedModeBanner: false,
                  theme: shad.ThemeData(
                    colorScheme: shad.ColorSchemes.lightZinc.copyWith(
                      destructive: () => AppColors.destructiveLight,
                    ),
                    typography: const shad.Typography.geist().copyWith(
                      sans: () => const TextStyle(fontFamily: 'NotoSans'),
                    ),
                  ),
                  darkTheme: shad.ThemeData.dark(
                    colorScheme: shad.ColorSchemes.darkZinc.copyWith(
                      destructive: () => AppColors.destructiveDark,
                    ),
                    typography: const shad.Typography.geist().copyWith(
                      sans: () => const TextStyle(fontFamily: 'NotoSans'),
                    ),
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
                    final authIdentity = context.select<AuthCubit, String?>(
                      (cubit) => cubit.state.user?.id,
                    );
                    return _ShadcnMaterialBridge(
                      child: AuthSessionBoundary(
                        identity: authIdentity,
                        child: DismissKeyboardOnPointerDown(
                          child: AppVersionGate(child: child!),
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
    );
  }
}

final class _AppLifecycleObserver extends WidgetsBindingObserver {
  _AppLifecycleObserver(this._onResumed);

  final VoidCallback _onResumed;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _onResumed();
    }
  }
}

class _ShadcnMaterialBridge extends StatelessWidget {
  const _ShadcnMaterialBridge({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final overlayStyle = AppTheme.systemUiOverlayStyleFor(
      theme.brightness,
    );

    return Theme(
      data: theme.brightness == Brightness.light
          ? AppTheme.light
          : AppTheme.dark,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: overlayStyle,
        child: child,
      ),
    );
  }
}
