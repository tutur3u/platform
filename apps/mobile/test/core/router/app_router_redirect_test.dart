import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
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
}
