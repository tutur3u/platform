part of 'assistant_repository.dart';

extension _AssistantNativeStreamAdapter on _AssistantChatRepository {
  Stream<AssistantStreamEvent> _adaptNativeChatEvents({
    required Stream<ChatMessageStreamEvent> events,
    required String chatId,
    required String wsId,
    required List<AssistantMessage> messages,
    required List<AssistantAttachment> attachments,
    required ApiMutationAdmission? admission,
    bool announceAdmission = true,
  }) async* {
    var assistantStarted = false;
    final requestId =
        messages.reversed
            .where((message) => message.role == 'user')
            .firstOrNull
            ?.clientRequestId ??
        messages.reversed
            .where((message) => message.role == 'user')
            .firstOrNull
            ?.id;
    final replyToMessageId = messages.reversed
        .where((message) => message.role == 'user')
        .firstOrNull
        ?.replyToMessageId;
    AssistantJsonStreamEvent userReceipt(ChatMessage saved) =>
        _nativeUserReceiptEvent(
          saved,
          chatId: chatId,
          wsId: wsId,
          requestId: requestId,
          text: _latestUserText(messages),
          attachments: attachments,
          replyToMessageId: replyToMessageId,
          admission: admission,
        );

    try {
      if (announceAdmission) {
        yield const AssistantJsonStreamEvent({
          'type': 'native-dispatch-admitted',
        });
      }
      admission?.check();
      await for (final event in events) {
        if (event is ChatStreamMessageEvent &&
            event.message.kind == ChatMessageKind.user) {
          yield userReceipt(event.message);
          continue;
        }
        if (event is ChatStreamAssistantDeltaEvent) {
          if (!assistantStarted) {
            assistantStarted = true;
            yield AssistantJsonStreamEvent({
              'type': 'start',
              'messageId': generateUuid(),
            });
          }
          yield AssistantJsonStreamEvent({
            'type': 'text-delta',
            'delta': event.delta,
          });
          continue;
        }

        if (event is ChatStreamAssistantPartEvent) {
          if (!assistantStarted) {
            assistantStarted = true;
            yield AssistantJsonStreamEvent({
              'type': 'start',
              'messageId': generateUuid(),
            });
          }
          yield _assistantEventFromChatPart(event.part);
          continue;
        }
        if (event is ChatStreamMessagesEvent) {
          requireAssistantMessageReceipts(
            event.messages,
            conversationId: chatId,
          );
          for (final user in event.messages.where(
            (message) => message.kind == ChatMessageKind.user,
          )) {
            yield userReceipt(user);
          }
          final assistantMessages = event.messages
              .where((message) => message.kind == ChatMessageKind.assistant)
              .map(_assistantMessageFromChatMessage)
              .toList(growable: false);
          if (!assistantStarted && assistantMessages.isNotEmpty) {
            assistantStarted = true;
            yield AssistantJsonStreamEvent({
              'type': 'start',
              'messageId': assistantMessages.first.id,
            });
          }
          yield AssistantJsonStreamEvent({
            'type': 'saved-messages',
            'messages': assistantMessages.map((m) => m.toJson()).toList(),
          });
          continue;
        }

        if (event is ChatStreamErrorEvent) {
          yield AssistantJsonStreamEvent({
            'type': 'error',
            'errorText': event.message,
          });
          continue;
        }

        if (event is ChatStreamDoneEvent) {
          yield const AssistantDoneStreamEvent();
        }
      }
    } on Object catch (error, stack) {
      Error.throwWithStackTrace(
        admission?.preparationFailure(error) ?? error,
        stack,
      );
    }
  }
}
