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
}
