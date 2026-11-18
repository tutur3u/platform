import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/dashboard/view/home_workspace_chip.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _studio = Workspace(id: 'ws-studio', name: 'Studio');
const _lab = Workspace(id: 'ws-lab', name: 'Lab');

void main() {
  late _Workspaces workspaces;

  Future<void> pump(WidgetTester tester, Workspace? current) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final state = WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: const [_studio, _lab],
      currentWorkspace: current,
    );
    when(() => workspaces.hasAuthenticatedActor).thenReturn(false);
    when(workspaces.refreshHiddenWorkspaces).thenAnswer((_) async {});
    when(() => workspaces.state).thenReturn(state);
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: state,
    );
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaces,
        child: const Scaffold(body: HomeWorkspaceChip()),
      ),
    );
    await tester.pumpAndSettle();
  }

  setUp(() => workspaces = _Workspaces());

  testWidgets('names the workspace and hints at switching', (tester) async {
    await pump(tester, _studio);
    expect(find.text('Studio'), findsOneWidget);
    expect(
      tester.getSemantics(find.bySemanticsLabel('Studio')),
      matchesSemantics(
        label: 'Studio',
        hint: 'Switch workspace',
        isButton: true,
        hasTapAction: true,
      ),
    );
    expect(
      tester.getSize(find.byKey(homeWorkspaceChipKey)).height,
      greaterThanOrEqualTo(44),
    );
  });

  testWidgets('opens the workspace picker', (tester) async {
    await pump(tester, _studio);
    await tester.tap(find.byKey(homeWorkspaceChipKey));
    await tester.pumpAndSettle();
    expect(find.byType(WorkspacePickerSheet), findsOneWidget);
    expect(find.text('Lab'), findsOneWidget);
  });

  testWidgets('shows nothing without a current workspace', (tester) async {
    await pump(tester, null);
    expect(find.byKey(homeWorkspaceChipKey), findsNothing);
  });
}
