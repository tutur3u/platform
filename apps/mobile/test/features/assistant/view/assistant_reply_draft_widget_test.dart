import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';

import 'background_reply_harness.dart';

const _workspace = '22222222-2222-4222-8222-222222222222';
const _chat = '44444444-4444-4444-8444-444444444444';
const _first = '55555555-5555-4555-8555-555555555555';
const _second = '66666666-6666-4666-8666-666666666666';
const _saved = '77777777-7777-4777-8777-777777777777';

class _ReplyRepository extends ReplyRepository {
  List<AssistantMessage>? sent;

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId),
    messages: const [
      AssistantMessage(
        id: _first,
        role: 'assistant',
        isPersisted: true,
        parts: [AssistantMessagePart(type: 'text', text: 'First answer')],
      ),
      AssistantMessage(
        id: _second,
        role: 'assistant',
        isPersisted: true,
        parts: [AssistantMessagePart(type: 'text', text: 'Second answer')],
      ),
    ],
    attachmentsByMessageId: const {},
  );

  @override
  Stream<AssistantStreamEvent> streamChat({
    required String chatId,
    required String wsId,
    required String? workspaceContextId,
    required String modelId,
    required List<AssistantMessage> messages,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String timezone,
    List<AssistantAttachment> attachments = const [],
    String? creditWsId,
    ApiMutationAdmission? admission,
  }) {
    admission?.recordDispatchPossible();
    starts++;
    sent = messages;
    return stream.stream;
  }

  void acknowledge() {
    final row = sent!.lastWhere((message) => message.role == 'user');
    stream.add(
      AssistantJsonStreamEvent({
        'type': 'saved-user-message',
        'messageId': _saved,
        'clientRequestId': row.clientRequestId,
        'text': 'Reply draft',
        'message': row.copyWith(id: _saved, isPersisted: true).toJson(),
        'nativeReceipt': {
          'actorId': currentActorId,
          'workspaceId': _workspace,
          'chatId': _chat,
          'requestId': row.clientRequestId,
          'messageId': _saved,
          'text': 'Reply draft',
          'replyToMessageId': _first,
          'attachments': const <Object>[],
        },
      }),
    );
  }
}

void main() {
  for (final changed in [false, true]) {
    testWidgets('held reply ACK preserves new reply intent $changed', (
      tester,
    ) async {
      final repository = _ReplyRepository();
      final h = BackgroundReplyHarness(repository: repository);
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await h.chat.openChatById(_workspace, _chat);
      await tester.pumpAndSettle();
      if (find.byType(AssistantComposerFab).evaluate().isNotEmpty) {
        await tester.tap(find.byType(AssistantComposerFab));
        await tester.pumpAndSettle();
      }
      expect(h.chat.setReplyTarget(_first), isTrue);
      final controller =
          tester
              .widget<AssistantComposerDock>(find.byType(AssistantComposerDock))
              .controller
            ..text = 'Reply draft';
      await tester.pump();
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      for (var i = 0; i < 8 && repository.sent == null; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(repository.starts, 1);
      expect(repository.sent!.last.replyToMessageId, _first);
      // Send empties the composer before the ACK; the held reply stays sent.
      expect(controller.text, isEmpty);
      expect(h.chat.state.replyTarget, isNull);
      if (changed) expect(h.chat.setReplyTarget(_second), isTrue);
      repository.acknowledge();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(controller.text, isEmpty);
      // A reply target chosen while the send was held survives its ACK.
      expect(h.chat.state.replyTarget?.id, changed ? _second : isNull);
      expect(repository.starts, 1);
    });
  }
}
