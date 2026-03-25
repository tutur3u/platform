import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/view/workspace_select_page.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  group('WorkspaceSelectPage', () {
    late WorkspaceCubit workspaceCubit;

    const personalWorkspace = Workspace(
      id: 'personal_ws',
      name: 'Me',
      personal: true,
    );
    const systemWorkspace = Workspace(
      id: rootWorkspaceId,
      name: 'Platform',
    );
    const teamWorkspace = Workspace(
      id: 'ws_1',
      name: 'Product',
    );

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
    });

    testWidgets('renders personal, system, and team sections', (tester) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [teamWorkspace, systemWorkspace, personalWorkspace],
        currentWorkspace: teamWorkspace,
      );
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(
          value: workspaceCubit,
          child: const WorkspaceSelectPage(),
        ),
      );
      await tester.pump();

      expect(find.text('PERSONAL'), findsOneWidget);
      expect(find.text('SYSTEM'), findsOneWidget);
      expect(find.text('TEAM WORKSPACES'), findsOneWidget);
      expect(find.text('Platform'), findsOneWidget);
      expect(find.text('Product'), findsOneWidget);
    });
  });
}
