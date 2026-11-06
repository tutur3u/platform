import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/meet/meet_meeting.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/view/meet_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _WorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _Repository extends Mock implements MeetRepository {}

void main() {
  testWidgets('phones keep New meeting in the single dock slot ahead of '
      'Search', (tester) async {
    // Under 400dp the dock shows only its first dock action.
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(360, 780);
    addTearDown(tester.view.reset);
    final workspace = _WorkspaceCubit();
    final repository = _Repository();
    final actions = ShellChromeActionsCubit();
    addTearDown(actions.close);
    when(() => workspace.state).thenReturn(
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'ws-1', name: 'Workspace'),
      ),
    );
    when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
    when(() => repository.listMeetings('ws-1', search: '')).thenAnswer(
      (_) async => MeetMeetingsPage(
        meetings: [
          MeetMeeting(
            id: 'meeting-1',
            name: 'Synthetic meeting',
            time: DateTime(2026, 9, 19),
            recordingSessions: const [],
          ),
        ],
        totalCount: 1,
        page: 1,
        pageSize: 20,
      ),
    );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider.value(value: actions),
        ],
        child: MeetPage(repository: repository),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final dock = actions.state
        .resolveForLocation(Routes.meet)
        .where((action) => action.inDock)
        .map((action) => action.id)
        .toList();
    expect(dock, ['meet-create', 'meet-search']);

    await tester.pumpWidget(const SizedBox.shrink());
    await workspace.close();
  });
}
