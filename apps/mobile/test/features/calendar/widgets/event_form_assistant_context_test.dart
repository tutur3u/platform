import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/assistant/bridge/assistant_screen_context.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _WorkspaceRepository extends Mock implements WorkspaceRepository {}

void main() {
  final registry = AssistantScreenContextRegistry.instance;
  tearDown(registry.clear);

  Future<WorkspaceCubit> workspaces() async {
    final repository = _WorkspaceRepository();
    for (final id in ['workspace-a', 'workspace-b']) {
      when(
        () => repository.saveSelectedWorkspace(Workspace(id: id)),
      ).thenAnswer((_) async {});
      when(
        () => repository.getMobileHiddenModuleIds(id),
      ).thenAnswer((_) async => []);
    }
    final cubit = WorkspaceCubit(workspaceRepository: repository);
    addTearDown(cubit.close);
    await cubit.selectWorkspace(const Workspace(id: 'workspace-a'));
    return cubit;
  }

  testWidgets('registry rechecks scope before reading mounted entry fields', (
    tester,
  ) async {
    final workspace = await workspaces();
    var reads = 0;
    await tester.pumpWidget(
      AssistantScreenContextScope(
        isCurrentScope: () =>
            workspace.state.currentWorkspace?.id == 'workspace-a',
        entry: AssistantScreenContextEntry(
          fields: [
            AssistantFormFieldContext(
              key: 'all_day',
              label: 'All day',
              type: 'boolean',
              value: () {
                reads++;
                return 'false';
              },
            ),
          ],
        ),
        child: const SizedBox(),
      ),
    );
    expect(registry.snapshot(), isNotEmpty);
    expect(reads, 1);
    final scope = tester.element(find.byType(AssistantScreenContextScope));
    await workspace.selectWorkspace(const Workspace(id: 'workspace-b'));
    // No frame or re-registration between the switch and the outgoing read.
    expect(scope.mounted, isTrue);
    expect(registry.snapshot(), isEmpty);
    expect(reads, 1);
  });

  for (final editing in [false, true]) {
    testWidgets(
      '${editing ? 'edit' : 'create'} form mounted across workspace switch '
      'shares nothing',
      (tester) async {
        final workspace = await workspaces();
        await tester.pumpApp(
          Builder(
            builder: (context) => Material(
              child: TextButton(
                onPressed: () => showEventFormSheet(
                  context,
                  event: editing
                      ? CalendarEvent(
                          id: 'event-a',
                          title: 'Workspace A meeting',
                          startAt: DateTime.utc(2026, 10, 26, 2),
                          endAt: DateTime.utc(2026, 10, 26, 3),
                        )
                      : null,
                  isCurrentScope: () =>
                      workspace.state.currentWorkspace?.id == 'workspace-a',
                ),
                child: const Text('Open editor'),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open editor'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byType(TextField).first,
          'Workspace A draft',
        );
        await tester.pump();
        expect(registry.snapshot()['form'], isNotNull);
        if (editing) {
          expect(registry.snapshot()['visibleRecords'], [
            {'type': 'calendar_event', 'id': 'event-a'},
          ]);
        }
        final scope = tester.element(find.byType(AssistantScreenContextScope));
        await workspace.selectWorkspace(const Workspace(id: 'workspace-b'));
        expect(scope.mounted, isTrue);
        expect(registry.snapshot(), isEmpty);
        await tester.pumpAndSettle();
        expect(scope.mounted, isTrue);
        expect(registry.snapshot(), isEmpty);
      },
    );
  }

  testWidgets('event form shares its fields with Mira only while open', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => Material(
          child: TextButton(
            onPressed: () => showEventFormSheet(
              context,
              isCurrentScope: () => true,
              event: CalendarEvent(
                id: 'event-1',
                title: 'Standup',
                startAt: DateTime.utc(2026, 10, 26, 2),
                endAt: DateTime.utc(2026, 10, 26, 3),
              ),
              timezone: 'Asia/Ho_Chi_Minh',
            ),
            child: const Text('Open editor'),
          ),
        ),
      ),
    );
    expect(registry.snapshot(), isEmpty);
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Team standup');
    await tester.pump();

    final snapshot = registry.snapshot();
    expect(snapshot['visibleRecords'], [
      {'type': 'calendar_event', 'id': 'event-1'},
    ]);
    final form = snapshot['form'] as Map<String, dynamic>;
    expect(form['title'], 'edit_calendar_event');
    final fields = {
      for (final field in (form['fields'] as List).cast<Map<String, dynamic>>())
        field['key']: field['value'],
    };
    expect(fields['title'], 'Team standup');
    expect(fields['all_day'], 'false');
    expect(fields['start'], startsWith('2026-10-26T09:00'));

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(registry.snapshot(), isEmpty);
  });
}
