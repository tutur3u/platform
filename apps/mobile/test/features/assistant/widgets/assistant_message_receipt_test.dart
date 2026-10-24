import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    testWidgets('truthful receipt transitions and typography $locale', (
      tester,
    ) async {
      final question = AssistantMessage(
        id: 'request',
        clientRequestId: 'request',
        role: 'user',
        createdAt: DateTime(2026, 10, 23, 9, 7),
        parts: const [AssistantMessagePart(type: 'text', text: 'Question')],
      );
      final answer = AssistantMessage(
        id: 'answer',
        role: 'assistant',
        createdAt: DateTime(2026, 10, 23, 9, 8),
        parts: const [AssistantMessagePart(type: 'text', text: 'Answer')],
      );
      Future<void> mount(List<AssistantMessage> messages) async {
        await tester.pumpWidget(
          MaterialApp(
            locale: Locale(locale),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(
              body: SingleChildScrollView(
                child: AssistantTranscriptSection(
                  chatState: AssistantChatState(
                    fallbackChatId: 'chat',
                    messages: messages,
                  ),
                  liveState: const AssistantLiveState(),
                  assistantName: 'Mira',
                ),
              ),
            ),
          ),
        );
      }

      final delivered = locale == 'en' ? 'Delivered' : 'Đã gửi';
      final read = locale == 'en' ? 'Read' : 'Đã đọc';
      await mount([question]);
      expect(find.text(delivered), findsNothing);
      expect(find.text(read), findsNothing);
      expect(find.text('09:07'), findsOneWidget);
      // Even output without a saved-user acknowledgement cannot claim delivery.
      await mount([question, answer]);
      expect(find.text(read), findsNothing);
      final saved = question.copyWith(id: 'saved');
      await mount([saved]);
      expect(find.text(delivered), findsOneWidget);
      expect(
        tester.widget<Text>(find.text(delivered)).style!.fontWeight,
        FontWeight.w600,
      );
      expect(
        tester.widget<Text>(find.text('09:07')).style!.fontWeight,
        FontWeight.w300,
      );
      await mount([saved, answer]);
      expect(find.text(delivered), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 699));
      expect(find.text(read), findsNothing);
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text(read), findsOneWidget);
      expect(find.text(delivered), findsNothing);
      expect(find.text('09:08'), findsNothing);
      // Reopened legacy history has no acknowledgement provenance.
      await mount([
        AssistantMessage.fromJson(const {
          'id': 'history',
          'role': 'user',
          'created_at': '2026-10-23T09:07:00',
          'parts': [
            {'type': 'text', 'text': 'History'},
          ],
        }),
        answer,
      ]);
      expect(find.text(read), findsNothing);
      expect(find.text(delivered), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
