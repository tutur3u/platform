import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

class _Realtime extends Mock implements ChatRealtimeClient {}

class _Repository extends Mock implements ChatRepository {}

void main() {
  setUpAll(() => registerFallbackValue(ChatConversationType.channel));
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  for (final close in [false, true]) {
    test(
      'deferred send cancellation rejects ${close ? 'close' : 'actor change'}',
      () async {
        var actor = 'alice';
        final repo = _Repository();
        final realtime = _Realtime();
        when(
          () => realtime.connect(any()),
        ).thenAnswer((_) => const Stream.empty());
        final conversation = ChatConversation.fromJson(const {
          'id': 'conversation',
          'wsId': 'workspace',
          'type': 'channel',
        });
        final cubit = ChatCubit(
          repository: repo,
          realtimeClient: realtime,
          currentUserId: () => actor,
        );
        cubit.emit(
          cubit.state.copyWith(
            wsId: 'workspace',
            conversations: [conversation],
            selectedConversationId: conversation.id,
          ),
        );
        final cancelling = Completer<void>();
        final finish = Completer<void>();
        final stream = StreamController<ChatMessageStreamEvent>(
          onCancel: () {
            if (!cancelling.isCompleted) cancelling.complete();
            return finish.future;
          },
        );
        var sends = 0;
        when(
          () => repo.sendMessageStream(
            any(),
            any(),
            content: any(named: 'content'),
            attachments: any(named: 'attachments'),
          ),
        ).thenAnswer((_) {
          sends++;
          return stream.stream;
        });
        when(repo.dispose).thenReturn(null);
        await cubit.sendMessage('First');
        cubit.emit(cubit.state.copyWith(isSending: false));
        final sending = cubit.sendMessage('Must not dispatch');
        await cancelling.future;
        Future<void>? closing;
        if (close) {
          closing = cubit.close();
        } else {
          actor = 'bob';
        }
        finish.complete();
        await sending;
        expect(sends, 1);
        if (closing != null) {
          await closing;
        } else {
          await cubit.close();
        }
        await stream.close();
      },
    );
  }

  test(
    'stale create result does not return or start selection reads',
    () async {
      var actor = 'alice';
      final repo = _Repository();
      final realtime = _Realtime();
      final result = Completer<ChatConversation>();
      when(
        () => repo.createConversation(any(), type: any(named: 'type')),
      ).thenAnswer((_) => result.future);
      when(repo.dispose).thenReturn(null);
      final cubit = ChatCubit(
        repository: repo,
        realtimeClient: realtime,
        currentUserId: () => actor,
      );
      cubit.emit(cubit.state.copyWith(wsId: 'workspace'));
      final creating = cubit.createConversation(
        type: ChatConversationType.channel,
      );
      actor = 'bob';
      result.complete(
        ChatConversation.fromJson(const {
          'id': 'old',
          'wsId': 'workspace',
          'type': 'channel',
        }),
      );
      expect(await creating, isNull);
      expect(cubit.state.conversations, isEmpty);
      await cubit.close();
    },
  );
}
