import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
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
  Future<_Cubit> pumpState(WidgetTester tester, WorkspaceState value) async {
    final cubit = _Cubit();
    whenListen(
      cubit,
      const Stream<WorkspaceState>.empty(),
      initialState: value,
    );
    when(() => cubit.hasAuthenticatedActor).thenReturn(true);
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: cubit,
        child: const Scaffold(body: WorkspaceVisibilitySheet()),
      ),
    );
    if (value.visibilityStatus == WorkspaceStatus.loading) {
      await tester.pump(const Duration(milliseconds: 300));
    } else {
      await tester.pumpAndSettle();
    }
    return cubit;
  }

  testWidgets('empty Hidden section shows a message without a header', (
    tester,
  ) async {
    await pumpState(tester, state.copyWith(hiddenWorkspaceIds: []));
    expect(find.text('No Hidden workspaces'), findsOneWidget);
    expect(
      tester
          .widgetList<AppSectionHeader>(find.byType(AppSectionHeader))
          .any((header) => header.title == 'Hidden workspaces'),
      isFalse,
    );
  });

  testWidgets('initial loading shows skeleton without workspace rows', (
    tester,
  ) async {
    await pumpState(
      tester,
      state.copyWith(
        visibilityResolved: false,
        visibilityStatus: WorkspaceStatus.loading,
      ),
    );
    expect(find.byType(AppSkeletonRows), findsOneWidget);
    expect(find.byType(AppToggleRow), findsNothing);
  });

  testWidgets('search finds visible and hidden workspaces', (tester) async {
    await pumpState(tester, state);
    await tester.enterText(find.byType(EditableText), 'hidden team');
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('workspace-visible-active')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('workspace-visible-hidden')),
      findsOneWidget,
    );
    await tester.enterText(find.byType(EditableText), 'not a workspace');
    await tester.pumpAndSettle();
    expect(find.byType(AppToggleRow), findsNothing);
    expect(find.text('No matching results'), findsOneWidget);
  });

  testWidgets('hiding last current workspace toasts and restore selects it', (
    tester,
  ) async {
    final cubit = _Cubit();
    final changes = StreamController<WorkspaceState>.broadcast();
    addTearDown(changes.close);
    const start = WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [active],
      currentWorkspace: active,
      visibilityResolved: true,
      visibilityStatus: WorkspaceStatus.loaded,
    );
    whenListen(cubit, changes.stream, initialState: start);
    when(() => cubit.hasAuthenticatedActor).thenReturn(true);
    when(() => cubit.setWorkspaceHidden(active.id, hidden: true)).thenAnswer((
      _,
    ) async {
      changes.add(
        start.copyWith(hiddenWorkspaceIds: [active.id], currentWorkspace: null),
      );
    });
    when(() => cubit.setWorkspaceHidden(active.id, hidden: false)).thenAnswer((
      _,
    ) async {
      changes.add(start.copyWith(currentWorkspace: null));
    });
    when(() => cubit.selectWorkspace(active)).thenAnswer((_) async {
      changes.add(start);
    });
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: cubit,
        child: const Scaffold(body: WorkspaceVisibilitySheet()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(AppSwitch));
    await tester.pumpAndSettle();
    expect(
      find.text('All workspaces are hidden. Show a workspace to continue.'),
      findsOneWidget,
    );
    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isFalse);
    await tester.tap(find.byType(AppSwitch));
    await tester.pumpAndSettle();
    verify(() => cubit.selectWorkspace(active)).called(1);
    await tester.drainShadToastTimers();
  });

  testWidgets('archived-only membership uses the picker empty state', (
    tester,
  ) async {
    final cubit = _Cubit();
    whenListen(
      cubit,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [archived],
        visibilityResolved: true,
        visibilityStatus: WorkspaceStatus.loaded,
      ),
    );
    when(() => cubit.hasAuthenticatedActor).thenReturn(true);
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: cubit,
        child: Scaffold(
          body: Builder(
            builder: (context) => WorkspacePickerSheet(parentContext: context),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('workspace-picker-empty')),
      findsOneWidget,
    );
    expect(
      find.text('Your workspaces are hidden. Restore one to continue.'),
      findsNothing,
    );
  });
}
