import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_ordered_parts.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_labels.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_results_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';

import '../../../helpers/helpers.dart';

AssistantMessagePart _tool(
  String name, {
  String state = 'output-available',
  Object? input,
  Object? output,
}) => AssistantMessagePart(
  type: 'dynamic-tool',
  toolName: name,
  toolCallId: 'call-$name-$state',
  state: state,
  input: input,
  output: output,
);

const AssistantMessagePart _stepStart = AssistantMessagePart(
  type: 'step-start',
);

final List<AssistantMessagePart> _turn = [
  _stepStart,
  const AssistantMessagePart(type: 'text', text: 'Let me look.'),
  _tool('search_tools', output: {'tools': 'get_my_tasks'}),
  _stepStart,
  _tool('select_tools', output: {'selectedTools': 'get_my_tasks'}),
  const AssistantMessagePart(type: 'reasoning', text: ''),
  _tool(
    'get_my_tasks',
    input: {'boardId': 'board-secret-id'},
    output: {
      'tasks': [
        {'id': 'task-1', 'boardId': 'board-secret-id'},
        {'id': 'task-2', 'boardId': 'board-secret-id'},
      ],
    },
  ),
  _stepStart,
  const AssistantMessagePart(type: 'text', text: '  '),
  _tool('get_upcoming_events', output: {'events': <Object>[]}),
  const AssistantMessagePart(type: 'text', text: 'Here is your day.'),
];

Widget _bubble(List<AssistantMessagePart> parts, {bool active = false}) =>
    Scaffold(
      body: SingleChildScrollView(
        child: AssistantTranscriptBubble(
          label: 'Mira',
          alignEnd: false,
          text: '',
          transcript: '',
          attachments: const [],
          timestamp: null,
          toolNames: const [],
          orderedParts: parts,
          activityActive: active,
        ),
      ),
    );

const ValueKey<String> _toggle = ValueKey('assistant-tools-toggle');

void main() {
  test('one group spans interleaved non-visible parts in source order', () {
    final children = assistantOrderedPartWidgets([
      ..._turn.take(10),
      _tool('create_image', output: {'storagePath': 'generated/a.png'}),
      _tool('create_task'),
      ..._turn.skip(10),
    ], active: false);
    expect(children.map((child) => child.key), const [
      ValueKey('assistant-text-part-1'),
      ValueKey('assistant-tool-part-2'),
      ValueKey('assistant-tool-part-10'),
      ValueKey('assistant-text-part-12'),
    ]);
    final group =
        (children[1] as Padding).child! as AssistantToolResultsSection;
    expect(group.parts.map((part) => part.toolName), [
      'search_tools',
      'select_tools',
      'get_my_tasks',
      'get_upcoming_events',
      'create_task',
    ]);
    expect((children[2] as Padding).child, isA<AssistantInlineToolImages>());
  });

  testWidgets('step count and label exclude meta tools', (tester) async {
    await tester.pumpApp(_bubble(_turn));
    expect(find.byType(AssistantToolResultsSection), findsOneWidget);
    expect(find.text('Checked your calendar'), findsOneWidget);
    expect(find.text(' · 2 steps'), findsOneWidget);
    expect(find.textContaining('search_tools'), findsNothing);
    expect(find.textContaining('select_tools'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a lone no_action_needed renders nothing', (tester) async {
    final parts = [
      _stepStart,
      _tool('no_action_needed', output: {'ok': true}),
      const AssistantMessagePart(type: 'text', text: "You're welcome!"),
    ];
    expect(
      assistantOrderedPartWidgets(
        parts,
        active: false,
      ).map((child) => child.key),
      const [ValueKey('assistant-text-part-2')],
    );
    await tester.pumpApp(_bubble(parts));
    expect(find.byType(AssistantToolResultsSection), findsNothing);
    expect(find.byKey(_toggle), findsNothing);
    expect(find.textContaining('no_action_needed'), findsNothing);
    expect(find.text("You're welcome!"), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('meta-only running turn shows a subtle working state', (
    tester,
  ) async {
    await tester.pumpApp(
      _bubble([_tool('search_tools', state: 'input-available')], active: true),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Working…'), findsOneWidget);
    expect(find.byKey(_toggle), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('raw JSON stays hidden until Details', (tester) async {
    await tester.pumpApp(_bubble(_turn));
    expect(find.textContaining('board-secret-id'), findsNothing);
    await tester.tap(find.byKey(_toggle));
    await tester.pumpAndSettle();
    expect(find.text('Checked your tasks'), findsOneWidget);
    expect(find.text('2 results'), findsOneWidget);
    expect(find.textContaining('board-secret-id'), findsNothing);
    final details = find.byKey(
      const ValueKey(
        'assistant-tool-details-call-get_my_tasks-output-available',
      ),
    );
    await tester.ensureVisible(details);
    await tester.tap(details);
    await tester.pumpAndSettle();
    expect(find.textContaining('board-secret-id'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('running and done states change label and status icon', (
    tester,
  ) async {
    final running = [
      _tool('search_tools'),
      _tool('get_my_tasks', state: 'input-available'),
    ];
    await tester.pumpApp(_bubble(running, active: true));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Checking your tasks'), findsOneWidget);
    expect(find.text(' · 1 step'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('assistant-tools-running-icon')),
      findsOneWidget,
    );

    await tester.pumpApp(
      _bubble([
        _tool('search_tools'),
        _tool('get_my_tasks', output: {'tasks': <Object>[]}),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Checked your tasks'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('assistant-tools-running-icon')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('assistant-tools-done-icon')),
      findsOneWidget,
    );

    // An interrupted stream must not keep spinning.
    await tester.pumpApp(_bubble(running));
    await tester.pumpAndSettle();
    expect(find.text('Checked your tasks'), findsOneWidget);
    expect(tester.binding.hasScheduledFrame, isFalse);
  });

  testWidgets('parallel calls name the pending step in the header', (
    tester,
  ) async {
    await tester.pumpApp(
      _bubble([
        _tool('get_my_tasks', state: 'input-available'),
        _tool('get_upcoming_events', output: {'events': <Object>[]}),
      ], active: true),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Checking your tasks'), findsOneWidget);
    expect(find.text('Checking your calendar'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('labels localize to Vietnamese', (tester) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => Localizations.override(
          context: context,
          locale: const Locale('vi'),
          child: _bubble(_turn),
        ),
      ),
    );
    expect(find.text('Đã xem lịch của bạn'), findsOneWidget);
    expect(find.text(' · 2 bước'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('unmapped tools fall back to humanized snake_case', () {
    expect(
      humanizeAssistantToolName('sync_github_issues'),
      'Sync github issues',
    );
    expect(humanizeAssistantToolName('fetchDocs'), 'Fetch docs');
    expect(assistantToolKind('get_my_tasks'), AssistantToolKind.tasksRead);
    expect(assistantToolKind('create_event'), AssistantToolKind.calendarWrite);
    expect(assistantToolKind('add_task_labels'), AssistantToolKind.taskUpdate);
    expect(assistantToolKind('mystery_tool'), AssistantToolKind.other);
  });
}
