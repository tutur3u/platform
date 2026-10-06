import 'dart:async';

import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

/// A terminal event ends transport consumption only after the server confirms
/// persistence, or explicitly reports failure. Text deltas alone are not saved.
Stream<ChatMessageStreamEvent> readChatMessageStream(
  Stream<List<int>> body, {
  bool requireAssistant = false,
}) async* {
  final parser = ChatNdjsonStreamParser();
  var acknowledged = false;
  var failed = false;
  bool accept(ChatMessageStreamEvent event) {
    bool saved(ChatMessage message) =>
        message.id.isNotEmpty &&
        (!requireAssistant || message.kind == ChatMessageKind.assistant);
    if ((event is ChatStreamMessageEvent && saved(event.message)) ||
        (event is ChatStreamMessagesEvent && event.messages.any(saved))) {
      acknowledged = true;
    }
    if (event is ChatStreamErrorEvent) failed = true;
    if (event is ChatStreamDoneEvent && !acknowledged && !failed) {
      throw StateError('Chat stream completed without a saved message');
    }
    return event is ChatStreamDoneEvent;
  }

  // StreamIterator cancels automatically on error. Detach source cleanup so
  // that even this automatic cancellation preserves the transport error.
  final guardedBody = Stream<List<int>>.multi((controller) {
    final subscription = body.listen(
      controller.addSync,
      onError: controller.addErrorSync,
      onDone: controller.closeSync,
    );
    controller
      ..onPause = subscription.pause
      ..onResume = subscription.resume
      ..onCancel = () {
        unawaited(subscription.cancel().catchError((Object _) {}));
      };
  });
  final iterator = StreamIterator<List<int>>(guardedBody);
  try {
    while (await iterator.moveNext()) {
      for (final event in parser.addChunk(iterator.current)) {
        final done = accept(event);
        yield event;
        if (done) return;
      }
    }
    for (final event in parser.close()) {
      final done = accept(event);
      yield event;
      if (done) return;
    }
    throw StateError('Chat stream ended without completion');
  } finally {
    // Initiate cancellation on every exit. Cleanup cannot replace a verified
    // terminal receipt or a real preterminal failure, nor hold either hostage.
    unawaited(iterator.cancel().catchError((Object _) {}));
  }
}
