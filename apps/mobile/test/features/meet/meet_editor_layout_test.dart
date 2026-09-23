import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/meet/meet_meeting.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/view/meet_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _WorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _Repository extends Mock implements MeetRepository {}

void main() {
  testWidgets('meeting editor stays scrollable after keyboard rotation', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(402, 874);
    addTearDown(tester.view.reset);
    final workspace = _WorkspaceCubit();
    final repository = _Repository();
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
            name: 'Rotation meeting',
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
      BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: MeetPage(repository: repository),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit meeting'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    tester.view.physicalSize = const Size(874, 402);
    tester.view.viewInsets = const FakeViewPadding(bottom: 226);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(tester.takeException(), isNull);

    final save = find.widgetWithText(FilledButton, 'Save');
    await tester.ensureVisible(save);
    await tester.pump();
    expect(save.hitTestable(), findsOneWidget);
    expect(tester.getBottomLeft(save).dy, lessThanOrEqualTo(402 - 226));

    tester.view.physicalSize = const Size(402, 874);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(tester.takeException(), isNull);
    expect(find.text('Rotation meeting'), findsWidgets);
    await tester.pumpWidget(const SizedBox.shrink());
    await workspace.close();
  });
}
