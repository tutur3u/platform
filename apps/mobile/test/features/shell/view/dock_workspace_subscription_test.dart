import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

class _WorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  testWidgets('dock ignores workspace metadata and fences account content', (
    tester,
  ) async {
    final cubit = _WorkspaceCubit();
    final chrome = ShellChromeActionsCubit();
    addTearDown(chrome.close);
    final states = StreamController<WorkspaceState>();
    addTearDown(states.close);
    const initial = WorkspaceState(currentWorkspace: Workspace(id: 'a'));
    whenListen(cubit, states.stream, initialState: initial);
    final slots = ShellDockSlotController();
    addTearDown(slots.dispose);
    slots.publish(
      Object(),
      const ShellDockSlot(
        location: '/mail',
        workspaceId: 'a',
        composing: true,
        content: Text('Workspace A composer'),
        primary: SizedBox.shrink(),
      ),
    );
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<WorkspaceCubit>.value(value: cubit),
          BlocProvider<ShellChromeActionsCubit>.value(value: chrome),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: ShellDockScope(
              controller: slots,
              child: const FloatingShellDock(
                location: '/mail',
                bottomInset: 68,
                navigation: Text('Navigation'),
                child: SizedBox.expand(),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final dock = tester.widget<PersistentShellDock>(
      find.byType(PersistentShellDock),
    );
    expect(dock.composing, isTrue);

    states.add(initial.copyWith(isCreating: true));
    await tester.pumpAndSettle();
    expect(
      tester.widget<PersistentShellDock>(find.byType(PersistentShellDock)),
      same(dock),
      reason: 'Unrelated workspace state must not rebuild dock configuration',
    );

    states.add(initial.copyWith(currentWorkspace: const Workspace(id: 'b')));
    await tester.pumpAndSettle();
    final switched = tester.widget<PersistentShellDock>(
      find.byType(PersistentShellDock),
    );
    expect(switched.composing, isFalse);
    expect(find.text('Workspace A composer'), findsNothing);
    expect(find.text('Navigation'), findsOneWidget);
  });
}
