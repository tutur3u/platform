import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_builders.dart';

import '../../../helpers/pump_app.dart';

void main() {
  group('TaskDescriptionTableEditorSheet', () {
    final twoByTwoTable = <String, dynamic>{
      'type': 'table',
      'content': [
        {
          'type': 'tableRow',
          'content': [
            {
              'type': 'tableHeader',
              'attrs': {'colspan': 1, 'rowspan': 1},
              'content': [
                {
                  'type': 'paragraph',
                  'content': [
                    {'type': 'text', 'text': 'H1'},
                  ],
                },
              ],
            },
            {
              'type': 'tableHeader',
              'attrs': {'colspan': 1, 'rowspan': 1},
              'content': [
                {
                  'type': 'paragraph',
                  'content': [
                    {'type': 'text', 'text': 'H2'},
                  ],
                },
              ],
            },
          ],
        },
        {
          'type': 'tableRow',
          'content': [
            {
              'type': 'tableCell',
              'attrs': {'colspan': 1, 'rowspan': 1},
              'content': [
                {
                  'type': 'paragraph',
                  'content': [
                    {'type': 'text', 'text': 'A1'},
                  ],
                },
              ],
            },
            {
              'type': 'tableCell',
              'attrs': {'colspan': 1, 'rowspan': 1},
              'content': [
                {
                  'type': 'paragraph',
                  'content': [
                    {'type': 'text', 'text': 'A2'},
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    testWidgets('renders table cells from initial node', (tester) async {
      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: twoByTwoTable,
          ),
        ),
      );
      await tester.pump();

      expect(find.text('H1'), findsOneWidget);
      expect(find.text('H2'), findsOneWidget);
      expect(find.text('A1'), findsOneWidget);
      expect(find.text('A2'), findsOneWidget);
    });

    testWidgets('shows all four add/remove action buttons', (tester) async {
      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: twoByTwoTable,
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Add row'), findsOneWidget);
      expect(find.text('Remove row'), findsOneWidget);
      expect(find.text('Add column'), findsOneWidget);
      expect(find.text('Remove column'), findsOneWidget);
    });

    testWidgets('adds a new row when Add row is tapped', (tester) async {
      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: twoByTwoTable,
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Add row'));
      await tester.pump();

      final state = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      expect(state.rowCount, equals(3));
    });

    testWidgets('removes last row when Remove row is tapped', (tester) async {
      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: twoByTwoTable,
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Remove row'));
      await tester.pump();

      final state = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      expect(state.rowCount, equals(1));
    });

    testWidgets('Remove row button is disabled when only 1 row', (
      tester,
    ) async {
      final oneRowTable = <String, dynamic>{
        'type': 'table',
        'content': [
          {
            'type': 'tableRow',
            'content': [
              {
                'type': 'tableHeader',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'H1'},
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: oneRowTable,
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Remove row'), findsOneWidget);

      final stateBefore = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      final rowCountBefore = stateBefore.rowCount;

      await tester.tap(find.text('Remove row'));
      await tester.pump();

      final stateAfter = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      expect(stateAfter.rowCount, equals(rowCountBefore));
    });

    testWidgets('adds a new column when Add column is tapped', (tester) async {
      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: twoByTwoTable,
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Add column'));
      await tester.pump();

      final state = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      expect(state.columnCount, equals(3));
    });

    testWidgets('removes last column when Remove column is tapped', (
      tester,
    ) async {
      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: twoByTwoTable,
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Remove column'));
      await tester.pump();

      final state = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      expect(state.columnCount, equals(1));
    });

    testWidgets('Remove column button is disabled when only 1 column', (
      tester,
    ) async {
      final oneColTable = <String, dynamic>{
        'type': 'table',
        'content': [
          {
            'type': 'tableRow',
            'content': [
              {
                'type': 'tableHeader',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'H1'},
                    ],
                  },
                ],
              },
            ],
          },
          {
            'type': 'tableRow',
            'content': [
              {
                'type': 'tableCell',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'A1'},
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: oneColTable,
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Remove column'), findsOneWidget);

      final stateBefore = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      final colCountBefore = stateBefore.columnCount;

      await tester.tap(find.text('Remove column'));
      await tester.pump();

      final stateAfter = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      expect(stateAfter.columnCount, equals(colCountBefore));
    });

    testWidgets(
      'buildEditedTableNode preserves tableHeader for first row and tableCell '
      'for others',
      (tester) async {
        await tester.pumpApp(
          Material(
            child: TaskDescriptionTableEditorSheet(
              initialTableNode: twoByTwoTable,
            ),
          ),
        );
        await tester.pump();

        final state = tester.state<TaskDescriptionTableEditorSheetState>(
          find.byType(TaskDescriptionTableEditorSheet),
        );
        final builtNode = state.buildEditedTableNode();

        final rows = (builtNode['content'] as List)
            .cast<Map<String, dynamic>>();
        expect(rows[0]['type'], equals('tableRow'));
        final firstRowFirstCell =
            (rows[0]['content'] as List)[0] as Map<String, dynamic>;
        expect(firstRowFirstCell['type'], equals('tableHeader'));
        expect(rows[1]['type'], equals('tableRow'));
        final secondRowFirstCell =
            (rows[1]['content'] as List)[0] as Map<String, dynamic>;
        expect(secondRowFirstCell['type'], equals('tableCell'));
      },
    );

    testWidgets(
      'buildEditedTableNode preserves original attrs after row add/remove',
      (tester) async {
        await tester.pumpApp(
          Material(
            child: TaskDescriptionTableEditorSheet(
              initialTableNode: twoByTwoTable,
            ),
          ),
        );
        await tester.pump();

        await tester.tap(find.text('Add row'));
        await tester.pump();
        await tester.tap(find.text('Remove column'));
        await tester.pump();

        final state = tester.state<TaskDescriptionTableEditorSheetState>(
          find.byType(TaskDescriptionTableEditorSheet),
        );
        final builtNode = state.buildEditedTableNode();

        final rows = (builtNode['content'] as List)
            .cast<Map<String, dynamic>>();

        final firstRowFirstCell =
            (rows[0]['content'] as List)[0] as Map<String, dynamic>;
        final attrs = firstRowFirstCell['attrs'] as Map<String, dynamic>?;
        expect(attrs, isNotNull);
        expect(attrs!['colspan'], equals(1));
        expect(attrs['rowspan'], equals(1));
      },
    );

    testWidgets('buildEditedTableNode returns valid TipTap table structure', (
      tester,
    ) async {
      await tester.pumpApp(
        Material(
          child: TaskDescriptionTableEditorSheet(
            initialTableNode: twoByTwoTable,
          ),
        ),
      );
      await tester.pump();

      final state = tester.state<TaskDescriptionTableEditorSheetState>(
        find.byType(TaskDescriptionTableEditorSheet),
      );
      final builtNode = state.buildEditedTableNode();

      expect(builtNode['type'], equals('table'));
      expect(builtNode['content'], isA<List<dynamic>>());

      final rows = (builtNode['content'] as List).cast<Map<String, dynamic>>();
      expect(rows.length, equals(2));

      for (final row in rows) {
        expect(row['type'], equals('tableRow'));
        expect(row['content'], isA<List<dynamic>>());
      }
    });
  });
}
