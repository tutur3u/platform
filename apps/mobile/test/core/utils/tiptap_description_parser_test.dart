import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _TipTapSheetTaskRepository extends TaskRepository {
  _TipTapSheetTaskRepository(this._descriptionJson);

  final String _descriptionJson;

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    return TaskBoardDetail(
      id: boardId,
      wsId: wsId,
      name: 'Board Test',
      ticketPrefix: 'TASK',
      lists: const [
        TaskBoardList(
          id: 'list-1',
          boardId: 'board-1',
          name: 'Todo',
          status: 'active',
          color: 'BLUE',
        ),
      ],
      tasks: [
        TaskBoardTask(
          id: 'task-1',
          listId: 'list-1',
          displayNumber: 1,
          name: 'Long task',
          description: _descriptionJson,
          relationshipsLoaded: true,
        ),
      ],
    );
  }
}

void main() {
  group('parseTipTapTaskDescription', () {
    test('returns null for empty input', () {
      expect(parseTipTapTaskDescription(null), isNull);
      expect(parseTipTapTaskDescription('   '), isNull);
    });

    test('returns raw text for plain description', () {
      final parsed = parseTipTapTaskDescription('hello world');

      expect(parsed, isNotNull);
      expect(parsed!.markdown, 'hello world');
      expect(parsed.plainText, 'hello world');
      expect(parsed.hasContent, isTrue);
    });

    test('returns null for empty tiptap doc payload', () {
      final emptyDoc = jsonEncode({
        'type': 'doc',
        'content': <Object>[],
      });
      expect(parseTipTapTaskDescription(emptyDoc), isNull);
    });

    test('parses heading, paragraph, bullet list and task list', () {
      final json = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'heading',
            'attrs': {'level': 2},
            'content': [
              {'type': 'text', 'text': 'Plan'},
            ],
          },
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'Ship it'},
            ],
          },
          {
            'type': 'bulletList',
            'content': [
              {
                'type': 'listItem',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'One'},
                    ],
                  },
                ],
              },
              {
                'type': 'listItem',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'Two'},
                    ],
                  },
                ],
              },
            ],
          },
          {
            'type': 'taskList',
            'content': [
              {
                'type': 'taskItem',
                'attrs': {'checked': false},
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'Todo'},
                    ],
                  },
                ],
              },
              {
                'type': 'taskItem',
                'attrs': {'checked': true},
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'Done'},
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      final parsed = parseTipTapTaskDescription(json)!;

      expect(parsed.markdown, contains('## Plan'));
      expect(parsed.markdown, contains('Ship it'));
      expect(parsed.markdown, contains('- One'));
      expect(parsed.markdown, contains('- Two'));
      expect(parsed.markdown, contains('- [ ] Todo'));
      expect(parsed.markdown, contains('- [x] Done'));

      expect(parsed.plainText, contains('Plan'));
      expect(parsed.plainText, contains('Ship it'));
      expect(parsed.plainText, contains('• One'));
      expect(parsed.plainText, contains('[ ] Todo'));
      expect(parsed.plainText, contains('[x] Done'));
    });

    test('parses marks and mention', () {
      final json = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'Hi '},
              {
                'type': 'text',
                'text': 'there',
                'marks': [
                  {'type': 'bold'},
                  {'type': 'italic'},
                ],
              },
              {'type': 'text', 'text': ' '},
              {
                'type': 'mention',
                'attrs': {'displayName': 'Alex'},
              },
              {'type': 'text', 'text': ' '},
              {
                'type': 'text',
                'text': 'site',
                'marks': [
                  {
                    'type': 'link',
                    'attrs': {'href': 'https://example.com'},
                  },
                ],
              },
            ],
          },
        ],
      });

      final parsed = parseTipTapTaskDescription(json)!;

      expect(parsed.markdown, contains('_**there**_'));
      expect(parsed.markdown, contains('@@mention:0@@'));
      expect(parsed.markdown, contains('[site](https://example.com)'));
      expect(parsed.plainText, contains('Hi there @Alex site'));
      expect(parsed.mentions, hasLength(1));
      expect(parsed.mentions.first.displayName, 'Alex');
    });

    test('parses code block and table', () {
      final json = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'codeBlock',
            'attrs': {'language': 'ts'},
            'content': [
              {'type': 'text', 'text': 'const x = 1;'},
            ],
          },
          {
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
                          {'type': 'text', 'text': 'A'},
                        ],
                      },
                    ],
                  },
                  {
                    'type': 'tableHeader',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': 'B'},
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
                          {'type': 'text', 'text': '1'},
                        ],
                      },
                    ],
                  },
                  {
                    'type': 'tableCell',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': '2'},
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      final parsed = parseTipTapTaskDescription(json)!;

      expect(parsed.markdown, contains('```ts'));
      expect(parsed.markdown, contains('const x = 1;'));
      expect(parsed.markdown, contains('| A | B |'));
      expect(parsed.markdown, contains('| --- | --- |'));
      expect(parsed.markdown, contains('| 1 | 2 |'));
      expect(parsed.plainText, contains('const x = 1;'));
      expect(parsed.plainText, contains('| A | B |'));
    });

    test('does not duplicate first table row when no table headers exist', () {
      final json = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'table',
            'content': [
              {
                'type': 'tableRow',
                'content': [
                  {
                    'type': 'tableCell',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': 'A'},
                        ],
                      },
                    ],
                  },
                  {
                    'type': 'tableCell',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': 'B'},
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
                          {'type': 'text', 'text': '1'},
                        ],
                      },
                    ],
                  },
                  {
                    'type': 'tableCell',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': '2'},
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      final parsed = parseTipTapTaskDescription(json)!;
      final lines = parsed.markdown
          .split('\n')
          .where((line) => line.trim().isNotEmpty)
          .toList(growable: false);

      expect(lines.where((line) => line == '| A | B |'), hasLength(1));
      expect(lines.where((line) => line == '| 1 | 2 |'), hasLength(1));
    });

    test('falls back to raw text when invalid JSON', () {
      const raw = '{not valid json';
      final parsed = parseTipTapTaskDescription(raw)!;

      expect(parsed.markdown, raw);
      expect(parsed.plainText, raw);
    });

    testWidgets(
      'renders long parsed description without overflow in detail sheet',
      (
        tester,
      ) async {
        final description = jsonEncode({
          'type': 'doc',
          'content': [
            {
              'type': 'paragraph',
              'content': [
                {'type': 'text', 'text': 'Intro line'},
                {'type': 'text', 'text': ' with mention '},
                {
                  'type': 'mention',
                  'attrs': {
                    'displayName': 'Alex',
                    'avatarUrl': '/storage/v1/object/public/avatars/alex.png',
                    'entityType': 'user',
                    'subtitle': 'Engineering',
                  },
                },
              ],
            },
            {
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
                            {'type': 'text', 'text': 'Header A'},
                          ],
                        },
                      ],
                    },
                    {
                      'type': 'tableHeader',
                      'content': [
                        {
                          'type': 'paragraph',
                          'content': [
                            {'type': 'text', 'text': 'Header B'},
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
                            {'type': 'text', 'text': 'Row 1 Cell 1'},
                          ],
                        },
                      ],
                    },
                    {
                      'type': 'tableCell',
                      'content': [
                        {
                          'type': 'paragraph',
                          'content': [
                            {'type': 'text', 'text': 'Row 1 Cell 2'},
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              'type': 'paragraph',
              'content': [
                {'type': 'text', 'text': 'Image below:'},
              ],
            },
            {
              'type': 'image',
              'attrs': {
                'src': 'https://example.com/image.png',
                'alt': 'External image',
              },
            },
          ],
        });

        final parsed = parseTipTapTaskDescription(description);
        expect(parsed, isNotNull);
        expect(parsed!.markdown, contains('@@mention:0@@'));

        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 844);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final workspaceCubit = _MockWorkspaceCubit();
        final repository = _TipTapSheetTaskRepository(description);
        const workspace = Workspace(id: 'ws-1', name: 'Workspace');
        const workspaceState = WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: workspace,
          workspaces: [workspace],
        );

        whenListen(
          workspaceCubit,
          const Stream<WorkspaceState>.empty(),
          initialState: workspaceState,
        );

        addTearDown(workspaceCubit.close);

        await tester.pumpApp(
          BlocProvider<WorkspaceCubit>.value(
            value: workspaceCubit,
            child: TaskBoardDetailPage(
              boardId: 'board-1',
              taskRepository: repository,
            ),
          ),
        );

        await tester.pumpAndSettle();
        await tester.tap(find.text('Long task').first, warnIfMissed: false);
        await tester.pumpAndSettle();

        await tester.tap(find.byIcon(Icons.expand_more).first);
        await tester.pumpAndSettle();

        expect(find.textContaining('@Alex'), findsWidgets);
        expect(find.textContaining('Header A'), findsWidgets);
        expect(find.textContaining('Row 1 Cell 1'), findsWidgets);
        expect(tester.takeException(), isNull);
      },
    );
  });
}
