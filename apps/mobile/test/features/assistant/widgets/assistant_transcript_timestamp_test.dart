import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_transcript_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    for (final live in [false, true]) {
      Future<void> mount(WidgetTester tester, {bool drafts = false}) async {
        final chat = AssistantChatState(
          workspaceId: 'ws',
          fallbackChatId: 'chat',
          messages: drafts
              ? const []
              : [
                  AssistantMessage(
                    id: 'user',
                    role: 'user',
                    createdAt: DateTime(2026, 10, 10, 9, 12),
                    parts: const [
                      AssistantMessagePart(
                        type: 'text',
                        text: 'Saved question',
                      ),
                    ],
                  ),
                  AssistantMessage(
                    id: 'assistant',
                    role: 'assistant',
                    createdAt: DateTime(2026, 10, 10, 9, 14),
                    parts: const [
                      AssistantMessagePart(type: 'text', text: 'Saved answer'),
                    ],
                  ),
                ],
        );
        final voice = AssistantLiveState(
          workspaceId: 'ws',
          chatId: 'chat',
          userDraft: drafts ? 'Unsaved question' : '',
          assistantDraft: drafts ? 'Unsaved answer' : '',
        );
        final section = live
            ? AssistantLiveTranscriptSection(
                chatState: chat,
                liveState: voice,
                assistantName: 'Mira',
              )
            : AssistantTranscriptSection(
                chatState: chat,
                liveState: voice,
                assistantName: 'Mira',
              );
        await tester.pumpWidget(
          MaterialApp(
            locale: Locale(locale),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(body: SingleChildScrollView(child: section)),
          ),
        );
        await tester.pumpAndSettle();
      }

      testWidgets('only user saved timestamp survives live=$live $locale', (
        tester,
      ) async {
        await mount(tester);
        final bubbles = tester
            .widgetList<AssistantTranscriptBubble>(
              find.byType(AssistantTranscriptBubble),
            )
            .toList();
        expect(bubbles.length, 2);
        expect(
          bubbles.singleWhere((bubble) => bubble.alignEnd).timestamp,
          DateTime(2026, 10, 10, 9, 12),
        );
        expect(
          bubbles.singleWhere((bubble) => !bubble.alignEnd).timestamp,
          isNull,
        );
        expect(find.text('09:12'), findsOneWidget);
        expect(find.text('09:14'), findsNothing);
        expect(find.text('Saved question'), findsOneWidget);
        expect(find.text('Saved answer'), findsOneWidget);
      });
      testWidgets('unsaved drafts do not gain timestamps live=$live $locale', (
        tester,
      ) async {
        await mount(tester, drafts: true);
        final bubbles = tester
            .widgetList<AssistantTranscriptBubble>(
              find.byType(AssistantTranscriptBubble),
            )
            .toList();
        expect(bubbles.length, 2);
        expect(
          bubbles.every((bubble) => bubble.isDraft && bubble.timestamp == null),
          isTrue,
        );
        expect(find.text('09:12'), findsNothing);
        expect(find.text('09:14'), findsNothing);
      });
    }
  }
}
