import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/forgot_password_page.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mobile/features/auth/view/signup_page.dart';
import 'package:mobile/features/calendar/view/calendar_page.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/finance/view/finance_page.dart';
import 'package:mobile/features/finance/view/transaction_list_page.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/tasks/view/task_list_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_management_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_requests_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/view/workspace_select_page.dart';

/// Creates the app-level [GoRouter] with auth- and workspace-aware redirects.
GoRouter createAppRouter(AuthCubit authCubit, WorkspaceCubit workspaceCubit) {
  return GoRouter(
    debugLogDiagnostics: true,
    refreshListenable: _AppRefreshNotifier(authCubit, workspaceCubit),
    redirect: (context, state) {
      final authState = authCubit.state;
      final wsState = workspaceCubit.state;

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
          state.matchedLocation == Routes.signUp ||
          state.matchedLocation == Routes.forgotPassword;
      final isWsSelectRoute = state.matchedLocation == Routes.workspaceSelect;

      // Still loading auth → stay put
      if (authState.status == AuthStatus.unknown) return null;

      // Not authenticated → redirect to login
      if (authState.status == AuthStatus.unauthenticated && !isAuthRoute) {
        return Routes.login;
      }

      // Authenticated but on auth route → go to appropriate destination
      if (authState.status == AuthStatus.authenticated && isAuthRoute) {
        if (wsState.hasWorkspace) return Routes.home;
        if (wsState.status == WorkspaceStatus.loaded) {
          return Routes.workspaceSelect;
        }
        // Workspaces still loading → go home (will re-redirect once loaded)
        return Routes.home;
      }

      // From here on, user is authenticated and NOT on an auth route.
      if (authState.status != AuthStatus.authenticated) return null;

      // Workspace loaded but none selected → go to picker
      if (!isWsSelectRoute &&
          wsState.status == WorkspaceStatus.loaded &&
          !wsState.hasWorkspace) {
        return Routes.workspaceSelect;
      }

      // On workspace-select but already has a workspace → go home
      if (isWsSelectRoute && wsState.hasWorkspace) {
        return Routes.home;
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
        path: Routes.signUp,
        builder: (context, state) => const SignUpPage(),
      ),
      GoRoute(
        path: Routes.forgotPassword,
        builder: (context, state) => const ForgotPasswordPage(),
      ),

      // ── Workspace selection ──────────────────────
      GoRoute(
        path: Routes.workspaceSelect,
        builder: (context, state) => const WorkspaceSelectPage(),
      ),

      // ── Time tracker sub-pages (full-page, outside shell) ──
      GoRoute(
        path: Routes.timerRequests,
        builder: (context, state) => const TimeTrackerRequestsPage(),
      ),
      GoRoute(
        path: Routes.timerManagement,
        builder: (context, state) => const TimeTrackerManagementPage(),
      ),

      // ── Finance sub-pages (full-page, outside shell) ──
      GoRoute(
        path: Routes.transactions,
        builder: (context, state) => const TransactionListPage(),
      ),

      // ── Main shell with bottom navigation ────────
      ShellRoute(
        builder: (context, state, child) => ShellPage(child: child),
        routes: [
          GoRoute(
            path: Routes.home,
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: Routes.tasks,
            builder: (context, state) => const TaskListPage(),
          ),
          GoRoute(
            path: Routes.calendar,
            builder: (context, state) => const CalendarPage(),
          ),
          GoRoute(
            path: Routes.finance,
            builder: (context, state) => const FinancePage(),
          ),
          GoRoute(
            path: Routes.timer,
            builder: (context, state) => const TimeTrackerPage(),
          ),
          GoRoute(
            path: Routes.settings,
            builder: (context, state) => const SettingsPage(),
          ),
        ],
      ),
    ],
  );
}

/// Notifies [GoRouter] when auth or workspace state changes so it can
/// re-evaluate redirects.
class _AppRefreshNotifier extends ChangeNotifier {
  _AppRefreshNotifier(AuthCubit authCubit, WorkspaceCubit workspaceCubit) {
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
  }

  late final StreamSubscription<AuthState> _authSub;
  late final StreamSubscription<WorkspaceState> _wsSub;

  @override
  Future<void> dispose() async {
    await _authSub.cancel();
    await _wsSub.cancel();
    super.dispose();
  }
}
