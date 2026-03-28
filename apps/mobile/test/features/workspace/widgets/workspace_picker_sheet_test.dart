import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  group('WorkspacePickerSheet', () {
    late WorkspaceCubit workspaceCubit;

    const proWorkspace = Workspace(
      id: 'ws_1',
      name: 'Product',
      tier: workspaceTierPro,
    );
    const freeWorkspace = Workspace(
      id: 'ws_2',
      name: 'Design',
    );

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
    });

    testWidgets('shows tier badges for each workspace', (tester) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [proWorkspace, freeWorkspace],
        currentWorkspace: proWorkspace,
        defaultWorkspace: freeWorkspace,
      );
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showWorkspacePickerSheet(context),
                  child: const Text('Open picker'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open picker'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));

      expect(find.text('Product'), findsOneWidget);
      expect(find.text('Design'), findsOneWidget);
      expect(find.text(workspaceTierPro), findsOneWidget);
      expect(find.text(workspaceTierFree), findsOneWidget);
    });
  });
}
