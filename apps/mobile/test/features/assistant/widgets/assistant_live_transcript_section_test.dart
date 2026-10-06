import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_parts.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_snapshot.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_transcript_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    testWidgets(
      'history plus pending turn stays ordered without duplicates $locale',
      (tester) async {
        final parts = AssistantLiveTurnParts()..appendText('', 'First answer');
        final pending = AssistantLiveTurnSnapshot(
          id: 'live-100',
          userText: 'First question',
          userTranscript: '',
          assistantText: 'First answer',
          assistantTranscript: '',
          parts: parts,
          createdAt: DateTime.fromMicrosecondsSinceEpoch(100),
        );
        AssistantMessage message(
          String id,
          String turn,
          String role,
          String text,
        ) => AssistantMessage(
          id: id,
          liveTurnId: turn,
          role: role,
          parts: [AssistantMessagePart(type: 'text', text: text)],
          // Retry timestamps intentionally conflict with conversation order.
          createdAt: DateTime.fromMicrosecondsSinceEpoch(
            turn == 'live-100' ? 300 : 200,
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            locale: Locale(locale),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(
              body: SingleChildScrollView(
                child: AssistantLiveTranscriptSection(
                  assistantName: 'Mira',
                  chatState: AssistantChatState(
                    workspaceId: 'ws',
                    fallbackChatId: 'chat',
                    messages: [
                      message(
                        'second-user',
                        'live-200',
                        'user',
                        'Second question',
                      ),
                      message(
                        'second-assistant',
                        'live-200',
                        'assistant',
                        'Second answer',
                      ),
                      message(
                        'first-assistant',
                        'live-100',
                        'assistant',
                        'First answer',
                      ),
                    ],
                  ),
                  liveState: AssistantLiveState(
                    workspaceId: 'ws',
                    chatId: 'chat',
                    completedTurns: [pending],
                    userTranscript: 'Current question',
                    assistantTranscript: 'Current answer',
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final bubbles = tester
            .widgetList<AssistantTranscriptBubble>(
              find.byType(AssistantTranscriptBubble),
            )
            .toList();
        expect(
          bubbles.map(
            (bubble) => bubble.text.isEmpty ? bubble.transcript : bubble.text,
          ),
          [
            'First question',
            'First answer',
            'Second question',
            'Second answer',
            'Current question',
            'Current answer',
          ],
        );
        expect(find.text('First answer'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('different workspace history is never projected into Live', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantLiveTranscriptSection(
            assistantName: 'Mira',
            chatState: AssistantChatState(
              workspaceId: 'old-workspace',
              fallbackChatId: 'chat',
              messages: [
                AssistantMessage(
                  id: 'private',
                  role: 'user',
                  parts: [
                    AssistantMessagePart(type: 'text', text: 'Other workspace'),
                  ],
                ),
              ],
            ),
            liveState: AssistantLiveState(
              workspaceId: 'current-workspace',
              chatId: 'chat',
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Other workspace'), findsNothing);
  });

  test('live identity round trips without changing old cached messages', () {
    const old = AssistantMessage(id: 'old', role: 'assistant');
    expect(old.toJson().containsKey('liveTurnId'), isFalse);
    expect(AssistantMessage.fromJson(old.toJson()), old);
    const live = AssistantMessage(
      id: 'live',
      role: 'assistant',
      liveTurnId: 'live-100',
    );
    expect(
      AssistantMessage.fromJson(live.toJson()).copyWith(parts: const []),
      live,
    );
  });
}
