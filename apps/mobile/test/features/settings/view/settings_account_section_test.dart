import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/settings/view/settings_account_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../../helpers/helpers.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  testWidgets('Settings retains workspace management without a switcher', (
    tester,
  ) async {
    final cubit = _Workspaces();
    whenListen(
      cubit,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        workspaces: [
          Workspace(id: 'active'),
          Workspace(id: 'hidden'),
          Workspace(id: 'archived', deleted: true),
        ],
        hiddenWorkspaceIds: ['hidden'],
      ),
    );
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: cubit,
        child: const Scaffold(body: SettingsAccountSection()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Switch workspace'), findsNothing);
    expect(
      find.byKey(const ValueKey('settings-workspace-row')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('settings-hidden-workspaces-row')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('settings-delete-account-row')),
      findsOneWidget,
    );
  });
}
