import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('restored assistant text and tool parts retain source ordering', (
    tester,
  ) async {
    const original = AssistantMessage(
      id: 'turn',
      role: 'assistant',
      parts: [
        AssistantMessagePart(type: 'text', text: 'Before the action'),
        AssistantMessagePart(
          type: 'dynamic-tool',
          toolName: 'read_tasks',
          toolCallId: 'call',
          state: 'output-available',
          output: {'count': 1},
        ),
        AssistantMessagePart(type: 'text', text: 'After the action'),
      ],
    );
    final restored = AssistantMessage.fromJson(original.toJson());
    await tester.pumpApp(
      Scaffold(
        body: AssistantTranscriptBubble(
          label: 'Assistant',
          alignEnd: false,
          text: 'Before the action\nAfter the action',
          transcript: '',
          attachments: const [],
          timestamp: null,
          toolNames: const [],
          orderedParts: restored.parts,
        ),
      ),
    );
    final first = find.byKey(const ValueKey('assistant-text-part-0'));
    final tool = find.byKey(const ValueKey('assistant-tool-part-1'));
    final last = find.byKey(const ValueKey('assistant-text-part-2'));
    expect(tester.getTopLeft(first).dy, lessThan(tester.getTopLeft(tool).dy));
    expect(tester.getTopLeft(tool).dy, lessThan(tester.getTopLeft(last).dy));
    // Text and tools are siblings, outside any message content box.
    final textParents = find.ancestor(
      of: first,
      matching: find.byType(Container),
    );
    final toolParents = find.ancestor(
      of: tool,
      matching: find.byType(Container),
    );
    expect(textParents, findsNothing);
    expect(toolParents, findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('message actions are hidden until long press and copy content', (
    tester,
  ) async {
    String? clipboard;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          clipboard = (call.arguments as Map)['text'] as String;
        }
        return null;
      },
    );
    addTearDown(() {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      );
    });
    await tester.pumpApp(
      const Scaffold(
        body: AssistantTranscriptBubble(
          label: 'You are speaking',
          alignEnd: true,
          text: 'Please summarize the meeting',
          transcript: '',
          attachments: [],
          timestamp: null,
          toolNames: [],
        ),
      ),
    );
    final semantics = tester.ensureSemantics();
    expect(find.text('You are speaking'), findsNothing);
    final bubble = find.byWidgetPredicate(
      (widget) =>
          widget is Semantics && widget.properties.label == 'You are speaking',
    );
    expect(
      tester
          .getSemantics(bubble)
          .getSemanticsData()
          .hasAction(SemanticsAction.longPress),
      isTrue,
    );
    expect(find.text('Copy message'), findsNothing);
    await tester.longPress(find.text('Please summarize the meeting'));
    await tester.pumpAndSettle();
    expect(find.text('Message actions'), findsOneWidget);
    expect(find.text('Copy message'), findsOneWidget);
    await tester.tap(find.text('Copy message'));
    await tester.pumpAndSettle();
    expect(clipboard, 'Please summarize the meeting');
    expect(find.text('Copy message'), findsNothing);
    semantics.dispose();
    expect(tester.takeException(), isNull);
  });
}
