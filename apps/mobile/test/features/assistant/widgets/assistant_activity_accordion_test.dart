import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_ordered_parts.dart';
import 'package:mobile/features/assistant/widgets/assistant_thinking_accordion.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_results_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_summary.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../../../helpers/helpers.dart';

const _first = AssistantMessagePart(
  type: 'reasoning',
  text: '## First section\nVisible first detail.',
);
const _latest = AssistantMessagePart(
  type: 'reasoning',
  text: '**Latest section**\nVisible later detail.',
);
const _tool1 = AssistantMessagePart(
  type: 'dynamic-tool',
  toolName: 'read_tasks',
  toolCallId: 'one',
  state: 'output-available',
  output: {'count': 1},
);
const _tool2 = AssistantMessagePart(
  type: 'dynamic-tool',
  toolName: 'read_calendar',
  toolCallId: 'two',
  state: 'output-available',
  output: {'count': 2},
);

Widget _bubble(List<AssistantMessagePart> parts) => Scaffold(
  body: AssistantTranscriptBubble(
    label: 'Assistant',
    alignEnd: false,
    text: '',
    transcript: '',
    attachments: const [],
    timestamp: null,
    toolNames: const [],
    orderedParts: parts,
  ),
);

void main() {
  testWidgets(
    'single thinking panel shows latest heading and ordered visible details',
    (tester) async {
      await tester.pumpApp(
        _bubble(const [
          _first,
          AssistantMessagePart(type: 'text', text: 'Response before tools'),
          _latest,
          _tool1,
          _tool2,
          AssistantMessagePart(type: 'text', text: 'Response after tools'),
        ]),
      );
      expect(find.byType(AssistantThinkingAccordion), findsOneWidget);
      expect(find.text('Latest section'), findsOneWidget);
      expect(find.textContaining('Visible first detail.'), findsNothing);
      expect(find.textContaining('Visible later detail.'), findsNothing);
      expect(find.byType(AssistantToolSummary), findsOneWidget);
      expect(find.text('read_calendar ·'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
      final before = find.byKey(const ValueKey('assistant-text-part-1'));
      final tools = find.byKey(const ValueKey('assistant-tool-part-3'));
      final after = find.byKey(const ValueKey('assistant-text-part-5'));
      expect(
        tester.getTopLeft(before).dy,
        lessThan(tester.getTopLeft(tools).dy),
      );
      expect(
        tester.getTopLeft(tools).dy,
        lessThan(tester.getTopLeft(after).dy),
      );
      await tester.tap(find.byKey(const ValueKey('assistant-thinking-toggle')));
      await tester.pumpAndSettle();
      final first = find.textContaining('Visible first detail.');
      final later = find.textContaining('Visible later detail.');
      expect(first, findsOneWidget);
      expect(later, findsOneWidget);
      expect(
        tester.getTopLeft(first).dy,
        lessThan(tester.getTopLeft(later).dy),
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('adjacent tools collapse centrally and expand in source order', (
    tester,
  ) async {
    final restored = AssistantMessage.fromJson(
      const AssistantMessage(
        id: 'turn',
        role: 'assistant',
        parts: [_tool1, _tool2],
      ).toJson(),
    );
    await tester.pumpApp(_bubble(restored.parts));
    expect(find.byType(AssistantToolSummary), findsOneWidget);
    expect(find.text('read_calendar ·'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('read_tasks'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('assistant-tools-toggle')));
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.text('read_tasks')).dy,
      lessThan(tester.getTopLeft(find.text('read_calendar')).dy),
    );
    expect(find.byType(BottomSheet), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('response text and images split tool groups without reordering', () {
    final children = assistantOrderedPartWidgets(const [
      _tool1,
      _tool2,
      AssistantMessagePart(type: 'text', text: 'Response between calls'),
      _tool1,
      AssistantMessagePart(
        type: 'dynamic-tool',
        toolName: 'create_image',
        output: {'storagePath': 'generated/test.png'},
      ),
      _tool2,
    ], active: false);
    expect(children.map((child) => child.key), [
      const ValueKey('assistant-tool-part-0'),
      const ValueKey('assistant-text-part-2'),
      const ValueKey('assistant-tool-part-3'),
      const ValueKey('assistant-tool-part-4'),
      const ValueKey('assistant-tool-part-5'),
    ]);
    expect((children[0] as Padding).child, isA<AssistantToolResultsSection>());
    expect(
      ((children[0] as Padding).child! as AssistantToolResultsSection).parts,
      [_tool1, _tool2],
    );
    expect((children[3] as Padding).child, isA<AssistantInlineToolImages>());
  });

  for (final terminal in [
    AssistantChatStatus.idle,
    AssistantChatStatus.error,
  ]) {
    testWidgets(
      'only current streaming turn animates; $terminal stops thinking',
      (tester) async {
        const messages = [
          AssistantMessage(id: 'old', role: 'assistant', parts: [_first]),
          AssistantMessage(id: 'current', role: 'assistant', parts: [_latest]),
        ];
        Widget section(AssistantChatStatus status) => Scaffold(
          body: AssistantTranscriptSection(
            chatState: AssistantChatState(
              fallbackChatId: 'chat',
              status: status,
              messages: messages,
            ),
            liveState: const AssistantLiveState(),
            assistantName: 'Assistant',
          ),
        );
        await tester.pumpApp(section(AssistantChatStatus.streaming));
        await tester.pump(const Duration(milliseconds: 200));
        expect(find.byType(NovaLoadingIndicator), findsOneWidget);
        expect(
          find.byKey(const ValueKey('assistant-thinking-active-icon')),
          findsOneWidget,
        );
        expect(find.byType(AssistantChatFeedback), findsNothing);
        await tester.pumpApp(section(terminal));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('assistant-thinking-active-icon')),
          findsNothing,
        );
        expect(find.byType(NovaLoadingIndicator), findsNothing);
        expect(find.byType(AssistantChatFeedback), findsOneWidget);
        expect(tester.binding.hasScheduledFrame, isFalse);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('latest heading remains accessible and compact with large text', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpApp(
      MediaQuery(
        data: const MediaQueryData(
          size: Size(320, 900),
          textScaler: TextScaler.linear(3),
        ),
        child: _bubble(const [_first, _latest]),
      ),
    );
    expect(find.bySemanticsLabel('Reasoning: Latest section'), findsOneWidget);
    expect(find.textContaining('Visible later detail.'), findsNothing);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
