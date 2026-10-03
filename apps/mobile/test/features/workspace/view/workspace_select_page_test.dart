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
      name: 'Alex Nguyen',
      personal: true,
      tier: workspaceTierPlus,
      avatarUrl: 'https://example.com/alex.png',
    );
    const systemWorkspace = Workspace(
      id: rootWorkspaceId,
      name: 'Platform',
      tier: workspaceTierEnterprise,
    );
    const teamWorkspace = Workspace(
      id: 'ws_1',
      name: 'Product',
      tier: workspaceTierPro,
    );

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
      when(() => workspaceCubit.hasAuthenticatedActor).thenReturn(true);
    });

    for (final resolved in [false, true]) {
      testWidgets('preference failure keeps membership selectable '
          'with cached preferences=$resolved', (tester) async {
        const available = Workspace(id: 'available', name: 'Available team');
        const hidden = Workspace(id: 'hidden', name: 'Saved hidden team');
        final state = WorkspaceState(
          status: WorkspaceStatus.loaded,
          visibilityStatus: WorkspaceStatus.error,
          visibilityResolved: resolved,
          visibilityError: 'Preference unavailable',
          hiddenWorkspaceIds: const ['hidden'],
          workspaces: const [available, hidden],
        );
        when(() => workspaceCubit.state).thenReturn(state);
        whenListen(
          workspaceCubit,
          const Stream<WorkspaceState>.empty(),
          initialState: state,
        );
        when(
          () => workspaceCubit.selectWorkspace(available),
        ).thenAnswer((_) async {});
        when(
          () => workspaceCubit.refreshHiddenWorkspaces(),
        ).thenAnswer((_) async {});
        await tester.pumpApp(
          BlocProvider.value(
            value: workspaceCubit,
            child: const WorkspaceSelectPage(),
          ),
        );
        await tester.pump();
        expect(find.text('Available team'), findsOneWidget);
        expect(find.text('Saved hidden team'), findsNothing);
        expect(find.text('Retry'), findsOneWidget);
        await tester.tap(find.text('Retry'));
        await tester.pump();
        verify(() => workspaceCubit.refreshHiddenWorkspaces()).called(1);
        await tester.tap(find.text('Available team'));
        await tester.pump();
        verify(() => workspaceCubit.selectWorkspace(available)).called(1);
        verifyNever(
          () => workspaceCubit.setWorkspaceHidden(
            any(),
            hidden: any(named: 'hidden'),
          ),
        );
      });
    }

    testWidgets('failed preference write does not become a load warning', (
      tester,
    ) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        visibilityStatus: WorkspaceStatus.loaded,
        visibilityResolved: true,
        visibilityError: 'Failed preference update',
        workspaces: [teamWorkspace],
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
      expect(find.text('Product'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);
    });

    testWidgets('renders personal, internal, and team sections', (
      tester,
    ) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        visibilityResolved: true,
        visibilityStatus: WorkspaceStatus.loaded,
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
      expect(find.text('INTERNAL'), findsOneWidget);
      expect(find.text('TEAM WORKSPACES'), findsOneWidget);
      expect(find.text('Alex Nguyen'), findsOneWidget);
      expect(find.text('Platform'), findsOneWidget);
      expect(find.text('Product'), findsOneWidget);
      expect(find.text('Plus'), findsOneWidget);
      expect(find.text('Enterprise'), findsOneWidget);
      expect(find.text('Pro'), findsOneWidget);
    });
  });
}
