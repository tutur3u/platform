import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/profile/view/profile_you_rows.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  late _MockWorkspaceCubit workspaces;
  late GoRouter router;
  var timelineOpened = 0;

  setUp(() {
    timelineOpened = 0;
    workspaces = _MockWorkspaceCubit();
    const all = [
      Workspace(id: 'ws-1', name: 'Kallo'),
      Workspace(id: 'ws-2', name: 'Tuturuuu'),
      Workspace(id: 'ws-3', name: 'Personal', personal: true),
    ];
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: all,
        currentWorkspace: Workspace(id: 'ws-1', name: 'Kallo'),
      ),
    );
    router = GoRouter(
      initialLocation: Routes.profileRoot,
      routes: [
        GoRoute(
          path: Routes.profileRoot,
          builder: (_, _) => Scaffold(
            body: ListView(
              children: [
                ProfileYouRows(onOpenTimeline: () => timelineOpened++),
              ],
            ),
          ),
        ),
        GoRoute(
          path: Routes.settings,
          builder: (_, _) => const Text('Settings page'),
        ),
      ],
    );
  });

  tearDown(() => router.dispose());

  Future<void> pump(WidgetTester tester, {double scale = 1}) async {
    tester.platformDispatcher.textScaleFactorTestValue = scale;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaces,
        child: MaterialApp.router(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('rows show the workspace count and open their surfaces', (
    tester,
  ) async {
    await pump(tester);

    expect(find.text('Workspaces'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    for (final key in ['workspaces', 'timeline', 'settings']) {
      expect(
        tester.getSize(find.byKey(ValueKey('you-row-$key'))).height,
        greaterThanOrEqualTo(44),
        reason: key,
      );
    }

    await tester.tap(find.byKey(const ValueKey('you-row-timeline')));
    expect(timelineOpened, 1);

    await tester.tap(find.byKey(const ValueKey('you-row-settings')));
    await tester.pumpAndSettle();
    expect(find.text('Settings page'), findsOneWidget);
  });

  testWidgets('rows fit 320dp at 2x text', (tester) async {
    tester.view
      ..physicalSize = const Size(320, 568)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pump(tester, scale: 2);
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('you-row-settings')), findsOneWidget);
  });
}
