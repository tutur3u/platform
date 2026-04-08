import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_dialogs.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_form_values.dart';

import '../../../helpers/helpers.dart';

void main() {
  group('TaskProjectSheet', () {
    testWidgets('updates status, priority, health, and lead while editing', (
      tester,
    ) async {
      TaskProjectFormValue? submittedValue;

      await tester.pumpApp(
        Builder(
          builder: (context) {
            return Scaffold(
              body: Center(
                child: FilledButton(
                  onPressed: () async {
                    submittedValue =
                        await showAdaptiveSheet<TaskProjectFormValue>(
                          context: context,
                          builder: (_) => TaskProjectSheet(
                            project: TaskProjectSummary(
                              id: 'project-1',
                              name: 'Roadmap refresh',
                              description: 'Refresh project roadmap',
                              wsId: 'ws-1',
                              creatorId: 'user-1',
                              createdAt: DateTime(2026),
                              tasksCount: 0,
                              completedTasksCount: 0,
                              linkedTasks: const [],
                              status: 'active',
                              priority: 'normal',
                            ),
                            workspaceUsers: const [
                              WorkspaceUserOption(
                                id: 'user-1',
                                displayName: 'Ada Lovelace',
                              ),
                              WorkspaceUserOption(
                                id: 'user-2',
                                displayName: 'Grace Hopper',
                              ),
                            ],
                          ),
                        );
                  },
                  child: const Text('Open dialog'),
                ),
              ),
            );
          },
        ),
      );

      await tester.tap(find.text('Open dialog'));
      await tester.pumpAndSettle();

      final statusField = find.byKey(const Key('statusDropdown'));
      await tester.ensureVisible(statusField);
      await tester.pumpAndSettle();
      await tester.tap(statusField.hitTestable());
      await tester.pumpAndSettle();
      await tester.tap(find.text('In progress').last);
      await tester.pumpAndSettle();

      final priorityField = find.byKey(const Key('priorityDropdown'));
      await tester.ensureVisible(priorityField);
      await tester.pumpAndSettle();
      await tester.tap(priorityField.hitTestable());
      await tester.pumpAndSettle();
      await tester.tap(find.text('High').last);
      await tester.pumpAndSettle();

      final healthField = find.byKey(const Key('healthDropdown'));
      await tester.ensureVisible(healthField);
      await tester.pumpAndSettle();
      await tester.tap(healthField.hitTestable());
      await tester.pumpAndSettle();
      await tester.tap(find.text('At risk').last);
      await tester.pumpAndSettle();

      final leadField = find.byKey(const Key('leadDropdown'));
      await tester.ensureVisible(leadField);
      await tester.pumpAndSettle();
      await tester.tap(leadField.hitTestable());
      await tester.pumpAndSettle();
      await tester.tap(find.text('Grace Hopper').last);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(submittedValue, isNotNull);
      expect(submittedValue?.status, 'in_progress');
      expect(submittedValue?.priority, 'high');
      expect(submittedValue?.healthStatus, 'at_risk');
      expect(submittedValue?.leadId, 'user-2');
    });
  });
}
