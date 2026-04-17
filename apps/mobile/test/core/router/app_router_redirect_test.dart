import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

void main() {
  group('shouldRedirectPersonalTimerRequests', () {
    test('returns true for personal workspace timer requests route', () {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'personal-1', personal: true),
      );

      expect(
        shouldRedirectPersonalTimerRequests(Routes.timerRequests, state),
        isTrue,
      );
    });

    test('returns false for non-personal workspace timer requests route', () {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'team-1'),
      );

      expect(
        shouldRedirectPersonalTimerRequests(Routes.timerRequests, state),
        isFalse,
      );
    });

    test('returns false for other routes even in personal workspace', () {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'personal-1', personal: true),
      );

      expect(shouldRedirectPersonalTimerRequests(Routes.timer, state), isFalse);
    });
  });

  group('shouldRedirectDisabledHabitsRoutes', () {
    test('returns true for habits route when habits are disabled', () {
      const state = HabitsAccessState(
        status: HabitsAccessStatus.loaded,
        wsId: 'team-1',
      );

      expect(shouldRedirectDisabledHabitsRoutes(Routes.habits, state), isTrue);
      expect(
        shouldRedirectDisabledHabitsRoutes(Routes.habitsActivity, state),
        isTrue,
      );
    });

    test('returns true for habits route while habits access is loading', () {
      const state = HabitsAccessState(
        status: HabitsAccessStatus.loading,
        wsId: 'team-1',
      );

      expect(shouldRedirectDisabledHabitsRoutes(Routes.habits, state), isTrue);
    });

    test('returns false for habits route when habits are enabled', () {
      const state = HabitsAccessState(
        status: HabitsAccessStatus.loaded,
        enabled: true,
        wsId: 'team-1',
      );

      expect(
        shouldRedirectDisabledHabitsRoutes(Routes.habitsActivity, state),
        isFalse,
      );
    });

    test('returns false for non-habits routes', () {
      const state = HabitsAccessState(
        status: HabitsAccessStatus.loaded,
        wsId: 'team-1',
      );

      expect(shouldRedirectDisabledHabitsRoutes(Routes.timer, state), isFalse);
    });
  });

  group('resolveUnauthenticatedRedirect', () {
    test('redirects /add-account to /login when add-account flow is off', () {
      final redirect = resolveUnauthenticatedRedirect(
        matchedLocation: Routes.addAccount,
        isAuthRoute: true,
        isAddAccountFlow: false,
        hasStoredAccounts: false,
      );

      expect(redirect, Routes.login);
    });

    test('keeps /add-account when add-account flow is on', () {
      final redirect = resolveUnauthenticatedRedirect(
        matchedLocation: Routes.addAccount,
        isAuthRoute: true,
        isAddAccountFlow: true,
        hasStoredAccounts: false,
      );

      expect(redirect, isNull);
    });

    test('redirects non-auth routes to /add-account while flow is on', () {
      final redirect = resolveUnauthenticatedRedirect(
        matchedLocation: Routes.home,
        isAuthRoute: false,
        isAddAccountFlow: true,
        hasStoredAccounts: true,
      );

      expect(redirect, Routes.addAccount);
    });

    test('keeps /add-account when recoverable stored accounts exist', () {
      final redirect = resolveUnauthenticatedRedirect(
        matchedLocation: Routes.addAccount,
        isAuthRoute: true,
        isAddAccountFlow: false,
        hasStoredAccounts: true,
      );

      expect(redirect, isNull);
    });
  });

  group('resolveAuthenticatedRedirect', () {
    test('keeps /add-account when authenticated add-account flow is on', () {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'team-1'),
      );

      final redirect = resolveAuthenticatedRedirect(
        matchedLocation: Routes.addAccount,
        isAuthRoute: true,
        isAddAccountFlow: true,
        workspaceState: state,
      );

      expect(redirect, isNull);
    });

    test('redirects authenticated /login to home when workspace exists', () {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'team-1'),
      );

      final redirect = resolveAuthenticatedRedirect(
        matchedLocation: Routes.login,
        isAuthRoute: true,
        isAddAccountFlow: false,
        workspaceState: state,
      );

      expect(redirect, Routes.home);
    });
  });
}
