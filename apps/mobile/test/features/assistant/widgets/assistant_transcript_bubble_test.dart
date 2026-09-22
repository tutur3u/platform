import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';

import '../../../helpers/helpers.dart';

void main() {
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
