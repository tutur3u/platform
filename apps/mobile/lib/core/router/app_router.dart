import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/forgot_password_page.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mobile/features/auth/view/mfa_verify_page.dart';
import 'package:mobile/features/auth/view/signup_page.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/transaction_list_page.dart';
import 'package:mobile/features/finance/view/wallet_detail_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/inventory/view/inventory_audit_logs_page.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/inventory/view/inventory_manage_page.dart';
import 'package:mobile/features/inventory/view/inventory_product_editor_page.dart';
import 'package:mobile/features/inventory/view/inventory_products_page.dart';
import 'package:mobile/features/inventory/view/inventory_sales_page.dart';
import 'package:mobile/features/mobile_versions/view/mobile_version_settings_page.dart';
import 'package:mobile/features/notifications/view/notifications_page.dart';
import 'package:mobile/features/profile/view/profile_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_members_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_roles_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_secrets_page.dart';
import 'package:mobile/features/shell/view/manage_accounts_page.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_page.dart';
import 'package:mobile/features/task_portfolio/view/task_project_detail_page.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/tasks_boards/view/task_boards_page.dart';
import 'package:mobile/features/tasks_estimates/view/task_estimates_page.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_requests_page.dart';
import 'package:mobile/features/time_tracker/widgets/stats_tab.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/view/workspace_select_page.dart';

bool shouldRedirectPersonalTimerRequests(
  String matchedLocation,
  WorkspaceState workspaceState,
) {
  return matchedLocation == Routes.timerRequests &&
      (workspaceState.currentWorkspace?.personal ?? false);
}

bool shouldRedirectDisabledHabitsRoutes(
  String matchedLocation,
  HabitsAccessState habitsAccessState,
) {
  return Routes.miniAppRootForLocation(matchedLocation) == Routes.habits &&
      (habitsAccessState.status != HabitsAccessStatus.loaded ||
          !habitsAccessState.enabled);
}

String? resolveUnauthenticatedRedirect({
  required String matchedLocation,
  required bool isAuthRoute,
  required bool isAddAccountFlow,
  required bool hasStoredAccounts,
}) {
  if (isAddAccountFlow && matchedLocation != Routes.addAccount) {
    return Routes.addAccount;
  }
  if (matchedLocation == Routes.addAccount &&
      (isAddAccountFlow || hasStoredAccounts)) {
    return null;
  }
  if (!isAddAccountFlow && matchedLocation == Routes.addAccount) {
    return Routes.login;
  }
  if (!isAuthRoute) {
    return Routes.login;
  }
  return null;
}

String? resolveAuthenticatedRedirect({
  required String matchedLocation,
  required bool isAuthRoute,
  required bool isAddAccountFlow,
  required WorkspaceState workspaceState,
}) {
  if (!isAuthRoute) {
    return null;
  }
  if (matchedLocation == Routes.addAccount && isAddAccountFlow) {
    return null;
  }
  if (workspaceState.hasWorkspace) {
    return Routes.home;
  }
  if (workspaceState.status == WorkspaceStatus.loaded) {
    return Routes.workspaceSelect;
  }
  return Routes.home;
}

HistoryViewMode? _parseHistoryViewMode(String? value) {
  switch (value) {
    case 'day':
      return HistoryViewMode.day;
    case 'week':
      return HistoryViewMode.week;
    case 'month':
      return HistoryViewMode.month;
    default:
      return null;
  }
}

DateTime? _parseHistoryDate(String? value) {
  if (value == null || value.isEmpty) return null;
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  return DateTime(parsed.year, parsed.month, parsed.day);
}

/// Creates the app-level [GoRouter] with auth- and workspace-aware redirects.
///
/// [initialLocation] sets the first route the router navigates to (used to
/// restore the user's last visited tab across app restarts).
GoRouter createAppRouter(
  AuthCubit authCubit,
  WorkspaceCubit workspaceCubit,
  HabitsAccessCubit habitsAccessCubit,
  InventoryAccessCubit inventoryAccessCubit,
  AppTabCubit appTabCubit, {
  String? initialLocation,
}) {
  return GoRouter(
    debugLogDiagnostics: true,
    initialLocation: initialLocation ?? Routes.home,
    refreshListenable: _AppRefreshNotifier(
      authCubit,
      workspaceCubit,
      habitsAccessCubit,
      inventoryAccessCubit,
    ),
    redirect: (context, state) {
      final authState = authCubit.state;
      final wsState = workspaceCubit.state;
      final habitsAccessState = habitsAccessCubit.state;
      final inventoryAccessState = inventoryAccessCubit.state;

      if (kDebugMode) {
        debugPrint(
          'Router redirect check: loc=${state.matchedLocation} '
          'auth=${authState.status} ws=${wsState.status} '
          'hasWs=${wsState.hasWorkspace} '
          'wsId=${wsState.currentWorkspace?.id}',
        );
      }

      final isAuthRoute =
          state.matchedLocation == Routes.login ||
          state.matchedLocation == Routes.addAccount ||
          state.matchedLocation == Routes.signUp ||
          state.matchedLocation == Routes.forgotPassword ||
          state.matchedLocation == Routes.mfaVerify;
      final isMfaRoute = state.matchedLocation == Routes.mfaVerify;
      final isWsSelectRoute = state.matchedLocation == Routes.workspaceSelect;

      // Still loading auth → keep on auth routes, redirect others to login.
      // In practice this rarely triggers since AuthCubit resolves state
      // synchronously from the cached Supabase session.
      if (authState.status == AuthStatus.unknown) {
        return isAuthRoute ? null : Routes.login;
      }

      // Not authenticated → enforce auth entry points.
      if (authState.status == AuthStatus.unauthenticated) {
        return resolveUnauthenticatedRedirect(
          matchedLocation: state.matchedLocation,
          isAuthRoute: isAuthRoute,
          isAddAccountFlow: authState.isAddAccountFlow,
          hasStoredAccounts:
              authState.accounts.isNotEmpty ||
              authState.activeAccountId != null,
        );
      }

      // MFA required → redirect to MFA verify page
      if (authState.status == AuthStatus.mfaRequired && !isMfaRoute) {
        return Routes.mfaVerify;
      }

      // On MFA page but no longer needed
      if (isMfaRoute && authState.status != AuthStatus.mfaRequired) {
        if (authState.status == AuthStatus.authenticated) return Routes.home;
        return Routes.login;
      }

      // Authenticated but on auth route → go to appropriate destination
      if (authState.status == AuthStatus.authenticated && isAuthRoute) {
        return resolveAuthenticatedRedirect(
          matchedLocation: state.matchedLocation,
          isAuthRoute: isAuthRoute,
          isAddAccountFlow: authState.isAddAccountFlow,
          workspaceState: wsState,
        );
      }

      // From here on, user is authenticated and NOT on an auth route.
      if (authState.status != AuthStatus.authenticated) return null;

      // Workspace loaded but none selected → go to picker
      if (!isWsSelectRoute &&
          wsState.status == WorkspaceStatus.loaded &&
          !wsState.hasWorkspace) {
        return Routes.workspaceSelect;
      }

      // Personal workspace cannot access timer requests page.
      if (shouldRedirectPersonalTimerRequests(state.matchedLocation, wsState)) {
        return Routes.timer;
      }

      if (shouldRedirectDisabledHabitsRoutes(
        state.matchedLocation,
        habitsAccessState,
      )) {
        return Routes.apps;
      }

      if (Routes.miniAppRootForLocation(state.matchedLocation) ==
              Routes.inventory &&
          (inventoryAccessState.status != InventoryAccessStatus.loaded ||
              !inventoryAccessState.enabled)) {
        return Routes.apps;
      }

      // On workspace-select but already has a workspace → go home
      if (isWsSelectRoute && wsState.hasWorkspace) {
        return Routes.home;
      }

      if (AppRegistry.moduleFromLocation(state.matchedLocation) != null) {
        appTabCubit.syncFromLocation(state.matchedLocation);
      }

      return null;
    },
    routes: [
      // ── Auth routes ──────────────────────────────
      GoRoute(
        path: Routes.login,
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: Routes.addAccount,
        builder: (context, state) => const LoginPage(addAccountMode: true),
      ),
      GoRoute(
        path: Routes.signUp,
        builder: (context, state) => const SignUpPage(),
      ),
      GoRoute(
        path: Routes.forgotPassword,
        builder: (context, state) => const ForgotPasswordPage(),
      ),
      GoRoute(
        path: Routes.mfaVerify,
        builder: (context, state) => const MfaVerifyPage(),
      ),
      // ── Workspace selection ──────────────────────
      GoRoute(
        path: Routes.workspaceSelect,
        builder: (context, state) => const WorkspaceSelectPage(),
      ),

      // ── Main shell with bottom navigation ────────
      ShellRoute(
        builder: (context, state, child) => BlocProvider(
          create: (_) => AssistantChromeCubit(),
          child: ShellPage(matchedLocation: state.uri.path, child: child),
        ),
        routes: [
          GoRoute(
            path: Routes.home,
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: Routes.apps,
            builder: (context, state) => const AppsHubPage(),
          ),
          GoRoute(
            path: Routes.assistant,
            builder: (context, state) => const AssistantPage(),
          ),
          GoRoute(
            path: Routes.notifications,
            builder: (context, state) => const NotificationsPage(),
          ),
          GoRoute(
            path: Routes.notificationsArchive,
            builder: (context, state) => const NotificationsPage.archive(),
          ),
          for (final module in AppRegistry.allModules)
            GoRoute(
              path: module.route,
              builder: (context, _) => module.pageBuilder(context),
            ),
          GoRoute(
            path: Routes.habits,
            builder: (context, state) => const HabitsPage(),
          ),
          GoRoute(
            path: Routes.habitsActivity,
            builder: (context, state) =>
                const HabitsPage(initialSection: HabitsSection.activity),
          ),
          GoRoute(
            path: Routes.habitsLibrary,
            builder: (context, state) =>
                const HabitsPage(initialSection: HabitsSection.library),
          ),
          GoRoute(
            path: Routes.taskBoards,
            builder: (context, state) => const TaskBoardsPage(),
          ),
          GoRoute(
            path: Routes.taskBoardDetail,
            builder: (context, state) {
              final boardId = state.pathParameters['boardId'];
              if (boardId == null || boardId.isEmpty) {
                return const TaskBoardsPage();
              }
              return TaskBoardDetailPage(
                boardId: boardId,
                initialTaskId: state.uri.queryParameters['taskId'],
              );
            },
          ),
          GoRoute(
            path: Routes.taskEstimates,
            builder: (context, state) => const TaskEstimatesPage(),
          ),
          GoRoute(
            path: Routes.taskPortfolio,
            builder: (context, state) => const TaskPortfolioPage(),
          ),
          GoRoute(
            path: Routes.taskPortfolioProject,
            builder: (context, state) {
              final projectId = state.pathParameters['projectId'];
              if (projectId == null || projectId.isEmpty) {
                return const TaskPortfolioPage();
              }
              return TaskProjectDetailPage(projectId: projectId);
            },
          ),
          GoRoute(
            path: Routes.inventoryProducts,
            builder: (context, state) => const InventoryProductsPage(),
          ),
          GoRoute(
            path: Routes.inventoryProductCreate,
            builder: (context, state) => const InventoryProductEditorPage(),
          ),
          GoRoute(
            path: Routes.inventoryProductDetail,
            builder: (context, state) {
              final productId = state.pathParameters['productId'];
              if (productId == null || productId.isEmpty) {
                return const InventoryProductsPage();
              }
              return InventoryProductEditorPage(productId: productId);
            },
          ),
          GoRoute(
            path: Routes.inventorySales,
            builder: (context, state) => const InventorySalesPage(),
          ),
          GoRoute(
            path: Routes.inventoryManage,
            builder: (context, state) => const InventoryManagePage(),
          ),
          GoRoute(
            path: Routes.inventoryAuditLogs,
            builder: (context, state) => const InventoryAuditLogsPage(),
          ),
          GoRoute(
            path: Routes.inventoryCheckout,
            builder: (context, state) => const InventoryCheckoutPage(),
          ),
          GoRoute(
            path: Routes.transactions,
            builder: (context, state) => const TransactionListPage(),
          ),
          GoRoute(
            path: Routes.categories,
            builder: (context, state) => const TransactionCategoriesPage(),
          ),
          GoRoute(
            path: Routes.wallets,
            builder: (context, state) => const WalletsPage(),
          ),
          GoRoute(
            path: Routes.walletDetail,
            builder: (context, state) {
              final walletId = state.pathParameters['walletId'];
              if (walletId == null || walletId.isEmpty) {
                return const WalletsPage();
              }
              return WalletDetailPage(walletId: walletId);
            },
          ),
          GoRoute(
            path: Routes.settingsWorkspace,
            builder: (context, state) => const SettingsWorkspacePage(),
          ),
          GoRoute(
            path: Routes.settingsWorkspaceSecrets,
            builder: (context, state) => const SettingsWorkspaceSecretsPage(),
          ),
          GoRoute(
            path: Routes.settingsWorkspaceMembers,
            builder: (context, state) => const SettingsWorkspaceMembersPage(),
          ),
          GoRoute(
            path: Routes.settingsWorkspaceRoles,
            builder: (context, state) => const SettingsWorkspaceRolesPage(),
          ),
          GoRoute(
            path: Routes.settingsMobileVersions,
            builder: (context, state) => const MobileVersionSettingsPage(),
          ),
          GoRoute(
            path: Routes.timerRequests,
            builder: (context, state) => TimeTrackerRequestsPage(
              initialRequestId: state.uri.queryParameters['requestId'],
              initialStatusOverride: state.uri.queryParameters['status'],
            ),
          ),
          GoRoute(
            path: Routes.timerHistory,
            builder: (context, state) {
              final query = state.uri.queryParameters;
              return TimeTrackerPage(
                initialSection: TimeTrackerSection.history,
                initialHistoryViewMode: _parseHistoryViewMode(
                  query['historyPeriod'],
                ),
                initialHistoryDate: _parseHistoryDate(query['historyDate']),
              );
            },
          ),
          GoRoute(
            path: Routes.timerStats,
            builder: (context, state) =>
                const TimeTrackerPage(initialSection: TimeTrackerSection.stats),
          ),
          GoRoute(
            path: Routes.timerManagement,
            builder: (context, state) => const TimeTrackerPage(
              initialSection: TimeTrackerSection.stats,
              initialStatsScope: TimeTrackerStatsScope.workspace,
            ),
          ),
          GoRoute(
            path: Routes.profileAccounts,
            builder: (context, state) => const ManageAccountsPage(),
          ),
          GoRoute(
            path: Routes.profileRoot,
            builder: (context, state) => const ProfilePage(),
          ),
        ],
      ),
    ],
  );
}

/// Notifies [GoRouter] when auth or workspace state changes so it can
/// re-evaluate redirects.
class _AppRefreshNotifier extends ChangeNotifier {
  _AppRefreshNotifier(
    AuthCubit authCubit,
    WorkspaceCubit workspaceCubit,
    HabitsAccessCubit habitsAccessCubit,
    InventoryAccessCubit inventoryAccessCubit,
  ) {
    _authSub = authCubit.stream.listen((state) {
      if (kDebugMode) {
        debugPrint('Router refresh: auth=${state.status}');
      }
      notifyListeners();
    });
    _wsSub = workspaceCubit.stream.listen((state) {
      if (kDebugMode) {
        debugPrint(
          'Router refresh: ws=${state.status} '
          'hasWs=${state.hasWorkspace} '
          'wsId=${state.currentWorkspace?.id}',
        );
      }
      notifyListeners();
    });
    _habitsAccessSub = habitsAccessCubit.stream.listen((_) {
      notifyListeners();
    });
    _inventoryAccessSub = inventoryAccessCubit.stream.listen((_) {
      notifyListeners();
    });
  }

  late final StreamSubscription<AuthState> _authSub;
  late final StreamSubscription<WorkspaceState> _wsSub;
  late final StreamSubscription<HabitsAccessState> _habitsAccessSub;
  late final StreamSubscription<InventoryAccessState> _inventoryAccessSub;

  @override
  Future<void> dispose() async {
    await _authSub.cancel();
    await _wsSub.cancel();
    await _habitsAccessSub.cancel();
    await _inventoryAccessSub.cancel();
    super.dispose();
  }
}
