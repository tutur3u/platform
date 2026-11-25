import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/documents/document_mention_source.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mocktail/mocktail.dart';

class _Tasks extends Mock implements TaskRepository {}

const DocumentMentionFallbacks _fallbacks = (
  workspace: 'Không gian',
  untitledProject: 'Dự án',
  untitledTask: 'Công việc',
);

void main() {
  late _Tasks tasks;
  TaskDocumentMentionSource source({bool personal = false}) =>
      TaskDocumentMentionSource(
        Workspace(id: 'ws-123456789', personal: personal),
        fallbacks: _fallbacks,
        repository: (_, _) => tasks,
      );

  setUp(() {
    tasks = _Tasks();
    when(() => tasks.getWorkspaceUsers(any())).thenAnswer(
      (_) async => const [WorkspaceUserOption(id: 'u1', displayName: 'Linh')],
    );
    when(() => tasks.getTaskProjects(any())).thenThrow(StateError('down'));
    when(() => tasks.getWorkspaceTasksForProjectLinking(any())).thenAnswer(
      (_) async => const [TaskLinkOption(id: 't1', name: '', listColor: 'RED')],
    );
  });

  test('one failed list still shows the others', () async {
    final options = await source().load();
    expect(options.map((o) => (o.type, o.label)), [
      (DocumentMentionType.user, 'Linh'),
      (DocumentMentionType.workspace, 'Không gian'),
      (DocumentMentionType.task, 'Công việc'),
    ]);
    expect(options.last.listColor, 'RED');
    expect(options[1].subtitle, 'ws-12345');
  });

  test('a load where every list fails is an error', () async {
    when(() => tasks.getWorkspaceUsers(any())).thenThrow(StateError('down'));
    when(
      () => tasks.getWorkspaceTasksForProjectLinking(any()),
    ).thenThrow(StateError('down'));
    await expectLater(source().load(), throwsStateError);
  });

  test('task search asks the server across the workspace', () async {
    when(
      () => tasks.getTimeTrackingTaskLinkOptions(
        any(),
        limit: any(named: 'limit'),
        offset: any(named: 'offset'),
        assignedToMe: any(named: 'assignedToMe'),
        searchQuery: any(named: 'searchQuery'),
      ),
    ).thenAnswer(
      (_) async => (
        tasks: const [TaskLinkOption(id: 't9', name: 'Ship', displayNumber: 9)],
        totalCount: 1,
      ),
    );
    final found = await source().searchTasks('Ship');
    expect(found.single.displayNumber, 9);
    verify(
      () => tasks.getTimeTrackingTaskLinkOptions(
        'ws-123456789',
        limit: 50,
        offset: 0,
        assignedToMe: false,
        searchQuery: 'Ship',
      ),
    ).called(1);
  });
}
