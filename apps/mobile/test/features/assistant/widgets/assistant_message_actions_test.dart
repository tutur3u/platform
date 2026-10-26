import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_reactions.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import '../../../helpers/helpers.dart';
import 'assistant_component_raster.dart';

void main() {
  setUpAll(loadAssistantRenderFonts);
  Future<void> mount(
    WidgetTester tester, {
    VoidCallback? onReply,
    ValueChanged<String>? onReact,
    VoidCallback? onRefresh,
    bool Function()? current,
  }) => tester.pumpApp(
    Scaffold(
      body: Center(
        child: AssistantTranscriptBubble(
          label: 'Mira',
          alignEnd: false,
          text: 'A saved answer',
          transcript: '',
          attachments: const [],
          timestamp: null,
          toolNames: const [],
          onReply: onReply,
          onReact: onReact,
          onRefreshReactions: onRefresh,
          isActionCurrent: current,
        ),
      ),
    ),
  );

  testWidgets('long press exposes reaction, copy and reply actions', (
    tester,
  ) async {
    configureAssistantRaster(tester);
    var replies = 0;
    String? reaction;
    await mount(
      tester,
      onReply: () => replies++,
      onReact: (value) => reaction = value,
    );
    await tester.longPress(find.text('A saved answer', findRichText: true));
    await tester.pumpAndSettle();
    expect(find.text('Copy message'), findsOneWidget);
    expect(find.text('Reply'), findsOneWidget);
    await renderAssistantComponent(tester, 'assistant-message-actions');
    await tester.tap(find.byKey(const ValueKey('assistant-react-like')));
    await tester.pumpAndSettle();
    expect(reaction, AssistantReaction.like.value);
    expect(replies, 0);
    await tester.longPress(find.text('A saved answer', findRichText: true));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reply'));
    await tester.pumpAndSettle();
    expect(replies, 1);
  });

  testWidgets('retired action sheet cannot reply or react in a new scope', (
    tester,
  ) async {
    var current = true;
    var actions = 0;
    await mount(
      tester,
      onReply: () => actions++,
      onReact: (_) => actions++,
      current: () => current,
    );
    await tester.longPress(find.text('A saved answer', findRichText: true));
    await tester.pumpAndSettle();
    current = false;
    await tester.tap(find.text('Reply'));
    await tester.pumpAndSettle();
    expect(actions, 0);
  });

  testWidgets('unconfirmed reaction offers a read instead of another toggle', (
    tester,
  ) async {
    var refreshes = 0;
    await mount(tester, onRefresh: () => refreshes++);
    await tester.longPress(find.text('A saved answer', findRichText: true));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('assistant-react-like')), findsNothing);
    await tester.tap(find.text('Refresh reactions'));
    await tester.pumpAndSettle();
    expect(refreshes, 1);
  });

  testWidgets('draft-only actions omit persisted reaction and reply controls', (
    tester,
  ) async {
    await mount(tester);
    await tester.longPress(find.text('A saved answer', findRichText: true));
    await tester.pumpAndSettle();
    expect(find.text('Copy message'), findsOneWidget);
    expect(find.text('Reply'), findsNothing);
    expect(find.byKey(const ValueKey('assistant-react-like')), findsNothing);
  });

  testWidgets('reaction summary retains counts and actor selection', (
    tester,
  ) async {
    String? selected;
    await tester.pumpApp(
      Scaffold(
        body: AssistantMessageReactions(
          actorId: 'actor',
          reactions: [
            ChatReactionSummary(
              emoji: AssistantReaction.like.value,
              count: 2,
              userIds: const ['actor', 'other'],
            ),
          ],
          onReact: (value) => selected = value,
        ),
      ),
    );
    expect(find.text('Like 2'), findsOneWidget);
    await tester.tap(find.text('Like 2'));
    expect(selected, AssistantReaction.like.value);
  });
}
