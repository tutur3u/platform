import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_view_harness.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  // The access check is the only thing that can hide the entry for good, so a
  // failed check has to heal without waiting for a workspace change.
  void grantAccess(MastermindViewHarness harness) =>
      when(
        () => harness.permissions.getPermissions(wsId: rootWorkspaceId),
      ).thenAnswer(
        (_) async => const WorkspacePermissions(
          permissions: {manageMastermindPermission},
          isCreator: false,
        ),
      );

  group('access error recovery', () {
    testWidgets('app resume retries a failed access check', (tester) async {
      final harness = MastermindViewHarness();
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.error);
      expect(harness.access.state.status, MastermindAccessStatus.error);

      grantAccess(harness);
      await harness.runtime.retryAccessAfterError(rootWorkspaceId);

      expect(harness.access.state.status, MastermindAccessStatus.loaded);
      expect(harness.access.state.visible, isTrue);
    });

    testWidgets('app resume leaves a healthy answer alone', (tester) async {
      final harness = MastermindViewHarness();
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      final seen = <MastermindAccessState>[];
      final sub = harness.access.stream.listen(seen.add);
      addTearDown(sub.cancel);

      await harness.runtime.retryAccessAfterError(rootWorkspaceId);

      expect(seen, isEmpty);
      verify(
        () => harness.permissions.getPermissions(wsId: rootWorkspaceId),
      ).called(1);
    });

    testWidgets('a quiet sync keeps the entry visible while it checks', (
      tester,
    ) async {
      final harness = MastermindViewHarness();
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      final statuses = <MastermindAccessStatus>[];
      final sub = harness.access.stream.listen(
        (state) => statuses.add(state.status),
      );
      addTearDown(sub.cancel);

      await harness.access.sync(rootWorkspaceId, quiet: true);
      expect(statuses, isNot(contains(MastermindAccessStatus.loading)));
      expect(harness.access.state.visible, isTrue);

      // A failed quiet check does not take away what was already known.
      when(
        () => harness.permissions.getPermissions(wsId: rootWorkspaceId),
      ).thenThrow(Exception('offline'));
      await harness.access.sync(rootWorkspaceId, quiet: true);
      expect(harness.access.state.status, MastermindAccessStatus.loaded);
      expect(harness.access.state.visible, isTrue);
    });

    testWidgets('pulling the Apps hub down re-checks access', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(430, 800);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final harness = MastermindViewHarness();
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.error);
      final tabs = AppTabCubit(settingsRepository: SettingsRepository());
      final experimental = ExperimentalAppsCubit(
        settingsRepository: SettingsRepository(),
      );
      final workspaces = _MockWorkspaceCubit();
      whenListen(
        workspaces,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          currentWorkspace: Workspace(id: rootWorkspaceId),
        ),
      );
      await experimental.load();
      addTearDown(tabs.close);
      addTearDown(experimental.close);
      addTearDown(workspaces.close);

      await tester.pumpApp(
        harness.wrap(
          MultiBlocProvider(
            providers: [
              BlocProvider.value(value: tabs),
              BlocProvider.value(value: experimental),
              BlocProvider<WorkspaceCubit>.value(value: workspaces),
            ],
            child: const AppsHubPage(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Mastermind'), findsNothing);

      grantAccess(harness);
      // The indicator arms after a quarter of the viewport height.
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 700));
      await tester.pumpAndSettle();

      expect(harness.access.state.visible, isTrue);
      expect(find.text('Mastermind'), findsOneWidget);
    });
  });
}
