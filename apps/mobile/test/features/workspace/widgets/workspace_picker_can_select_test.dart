import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_body.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _product = Workspace(id: 'ws_1', name: 'Product');
const _design = Workspace(id: 'ws_2', name: 'Design');
const _state = WorkspaceState(
  status: WorkspaceStatus.loaded,
  workspaces: [_product, _design],
  currentWorkspace: _product,
);

Future<_Workspaces> _open(
  WidgetTester tester, {
  required bool Function() canSelect,
}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final cubit = _Workspaces();
  when(() => cubit.hasAuthenticatedActor).thenReturn(false);
  when(() => cubit.selectWorkspace(any())).thenAnswer((_) async {});
  when(() => cubit.state).thenReturn(_state);
  whenListen(cubit, const Stream<WorkspaceState>.empty(), initialState: _state);
  await tester.pumpThemedHome(
    Builder(
      builder: (context) => Scaffold(
        body: TextButton(
          onPressed: () => showWorkspacePicker(context, canSelect: canSelect),
          child: const Text('Open picker'),
        ),
      ),
    ),
    wrap: (app) => BlocProvider<WorkspaceCubit>.value(value: cubit, child: app),
  );
  await tester.tap(find.text('Open picker'));
  await tester.pumpAndSettle();
  return cubit;
}

void main() {
  setUpAll(() => registerFallbackValue(_product));

  testWidgets('a refused selection closes the picker without switching', (
    tester,
  ) async {
    var allowed = true;
    final cubit = await _open(tester, canSelect: () => allowed);
    expect(find.byType(WorkspacePickerSheet), findsOneWidget);

    // A draft opens while the picker is showing.
    allowed = false;
    await tester.tap(find.byKey(workspacePickerRowKey('ws_2')));
    await tester.pumpAndSettle();

    expect(find.byType(WorkspacePickerSheet), findsNothing);
    verifyNever(() => cubit.selectWorkspace(any()));
  });

  testWidgets('an allowed selection switches the workspace', (tester) async {
    final cubit = await _open(tester, canSelect: () => true);

    await tester.tap(find.byKey(workspacePickerRowKey('ws_2')));
    await tester.pumpAndSettle();

    verify(() => cubit.selectWorkspace(_design)).called(1);
  });
}
