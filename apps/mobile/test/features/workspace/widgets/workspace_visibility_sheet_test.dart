import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_visibility_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Cubit extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  const active = Workspace(id: 'active', name: 'Active');
  const hidden = Workspace(id: 'hidden', name: 'Hidden team');
  const archived = Workspace(id: 'archived', name: 'Archived', deleted: true);
  const state = WorkspaceState(
    status: WorkspaceStatus.loaded,
    workspaces: [active, hidden, archived],
    hiddenWorkspaceIds: ['hidden'],
    currentWorkspace: hidden,
    visibilityResolved: true,
    visibilityStatus: WorkspaceStatus.loaded,
  );

  test('presentation counts exclude archived and hidden membership', () {
    expect(state.workspaces.length, 3);
    expect(state.visibleWorkspaces, [active]);
    expect(state.hiddenWorkspaces, [hidden]);
    expect(Workspace.fromJson(archived.toJson()), archived);
  });

  testWidgets('switches hide and restore through the existing cubit', (
    tester,
  ) async {
    final cubit = _Cubit();
    whenListen(
      cubit,
      const Stream<WorkspaceState>.empty(),
      initialState: state,
    );
    when(() => cubit.hasAuthenticatedActor).thenReturn(true);
    when(
      () => cubit.setWorkspaceHidden(any(), hidden: any(named: 'hidden')),
    ).thenAnswer((_) async {});
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: cubit,
        child: const Scaffold(body: WorkspaceVisibilitySheet()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Archived'), findsNothing);
    final activeSwitch = find.descendant(
      of: find.byKey(const ValueKey('workspace-visible-active')),
      matching: find.byType(AppSwitch),
    );
    final hiddenSwitch = find.descendant(
      of: find.byKey(const ValueKey('workspace-visible-hidden')),
      matching: find.byType(AppSwitch),
    );
    expect(tester.widget<AppSwitch>(activeSwitch).value, isTrue);
    expect(tester.widget<AppSwitch>(hiddenSwitch).value, isFalse);
    await tester.tap(activeSwitch);
    await tester.pump();
    verify(() => cubit.setWorkspaceHidden('active', hidden: true)).called(1);
    await tester.tap(hiddenSwitch);
    await tester.pump();
    verify(() => cubit.setWorkspaceHidden('hidden', hidden: false)).called(1);
  });

  testWidgets('unresolved preferences disable switches', (tester) async {
    final cubit = _Cubit();
    whenListen(
      cubit,
      const Stream<WorkspaceState>.empty(),
      initialState: state.copyWith(visibilityResolved: false),
    );
    when(() => cubit.hasAuthenticatedActor).thenReturn(true);
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: cubit,
        child: const Scaffold(body: WorkspaceVisibilitySheet()),
      ),
    );
    for (final control in tester.widgetList<AppSwitch>(
      find.byType(AppSwitch),
    )) {
      expect(control.onChanged, isNull);
    }
  });
}
