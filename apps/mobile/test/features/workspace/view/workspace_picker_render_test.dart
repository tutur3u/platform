import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/helpers.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _teamNames = [
  'Product',
  'Design',
  'Growth lab',
  'Ops',
  'Marketing',
  'Research',
  'Customer success',
  'Finance',
];

List<Workspace> _workspaces(int count) => [
  const Workspace(id: 'render-personal', name: 'Alex Nguyen', personal: true),
  for (var i = 1; i < count; i++)
    Workspace(
      id: 'render-team-$i',
      name: i <= _teamNames.length
          ? _teamNames[i - 1]
          : 'Team ${i.toString().padLeft(2, '0')}',
      tier: switch (i % 4) {
        0 => workspaceTierPro,
        1 => workspaceTierPlus,
        2 => workspaceTierEnterprise,
        _ => workspaceTierFree,
      },
    ),
];

/// Design review renders of the workspace picker. PNGs are written only when
/// `DESIGN_RENDER_DIR` is set (see `design_render_harness.dart`).
void main() {
  setUpAll(DesignRender.loadFonts);

  for (final count in [3, 40]) {
    for (final brightness in Brightness.values) {
      for (final locale in const [Locale('en'), Locale('vi')]) {
        final name = 'picker-$count-${brightness.name}-${locale.languageCode}';
        testWidgets('renders $name', (tester) async {
          DesignRender.setSize(tester, const Size(390, 844));
          final workspaces = _workspaces(count);
          final cubit = _Workspaces();
          final state = WorkspaceState(
            status: WorkspaceStatus.loaded,
            workspaces: workspaces,
            currentWorkspace: workspaces[2],
            defaultWorkspace: workspaces.first,
          );
          when(() => cubit.hasAuthenticatedActor).thenReturn(false);
          when(cubit.refreshHiddenWorkspaces).thenAnswer((_) async {});
          whenListen(
            cubit,
            const Stream<WorkspaceState>.empty(),
            initialState: state,
          );
          tester.platformDispatcher.localesTestValue = [locale];
          addTearDown(tester.platformDispatcher.clearLocalesTestValue);
          await tester.pumpThemedHome(
            Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: TextButton(
                    onPressed: () => showWorkspacePickerSheet(context),
                    child: const Text('Open picker'),
                  ),
                ),
              ),
            ),
            brightness: brightness,
            wrap: (app) => RepaintBoundary(
              key: DesignRenderApp.boundaryKey,
              child: BlocProvider<WorkspaceCubit>.value(
                value: cubit,
                child: app,
              ),
            ),
          );
          await tester.tap(find.text('Open picker'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await DesignRender.capture(tester, name);
        });
      }
    }
  }
}
