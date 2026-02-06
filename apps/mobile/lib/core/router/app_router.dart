import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
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
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/tasks/view/task_list_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/features/workspace/view/workspace_select_page.dart';

/// Creates the app-level [GoRouter] with auth-aware redirects.
GoRouter createAppRouter(AuthCubit authCubit) {
  return GoRouter(
    debugLogDiagnostics: true,
    refreshListenable: _AuthRefreshNotifier(authCubit),
    redirect: (context, state) {
      final authState = authCubit.state;
      final isAuthRoute =
          state.matchedLocation == Routes.login ||
          state.matchedLocation == Routes.signUp ||
          state.matchedLocation == Routes.forgotPassword;

      // Still loading → stay put
      if (authState.status == AuthStatus.unknown) return null;

      // Not authenticated → redirect to login
      if (authState.status == AuthStatus.unauthenticated && !isAuthRoute) {
        return Routes.login;
      }

      // Authenticated but on auth route → go home
      if (authState.status == AuthStatus.authenticated && isAuthRoute) {
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

/// Notifies [GoRouter] when auth state changes so it can re-evaluate redirects.
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(AuthCubit cubit) {
    cubit.stream.listen((_) => notifyListeners());
  }
}
