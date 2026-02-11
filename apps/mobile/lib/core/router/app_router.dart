import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/forgot_password_page.dart';
import 'package:mobile/features/auth/view/login_page.dart';
import 'package:mobile/features/auth/view/mfa_verify_page.dart';
import 'package:mobile/features/auth/view/signup_page.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/finance/view/transaction_list_page.dart';
import 'package:mobile/features/profile/view/profile_page.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_management_page.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_requests_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/view/workspace_select_page.dart';

/// Creates the app-level [GoRouter] with auth- and workspace-aware redirects.
///
/// [initialLocation] sets the first route the router navigates to (used to
/// restore the user's last visited tab across app restarts).
GoRouter createAppRouter(
  AuthCubit authCubit,
  WorkspaceCubit workspaceCubit,
  AppTabCubit appTabCubit, {
  String? initialLocation,
}) {
  return GoRouter(
    debugLogDiagnostics: true,
    initialLocation: initialLocation ?? Routes.home,
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

      // Not authenticated → redirect to login
      if (authState.status == AuthStatus.unauthenticated && !isAuthRoute) {
        return Routes.login;
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
            path: Routes.apps,
            builder: (context, state) => const AppsHubPage(),
          ),
          for (final module in AppRegistry.allModules)
            GoRoute(
              path: module.route,
              builder: (context, state) => module.pageBuilder(context),
            ),
          GoRoute(
            path: Routes.settings,
            builder: (context, state) => const SettingsPage(),
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
