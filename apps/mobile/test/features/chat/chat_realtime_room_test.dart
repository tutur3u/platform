import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Realtime extends Mock implements ChatRealtimeClient {}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('resync refetches without a local room for a non-uuid thread', () async {
    final api = _Api();
    final realtime = _Realtime();
    final inbox = StreamController<ChatRealtimeEvent>();
    var lists = 0;
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = invocation.positionalArguments.first as String;
      if (path.contains('/conversations?')) {
        lists += 1;
        return {
          'conversations': [
            {'id': 'ai-chat-local', 'wsId': 'workspace', 'type': 'ai'},
          ],
        };
      }
      return {};
    });
    when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
    when(() => realtime.connect(any())).thenAnswer((_) => inbox.stream);
    final cubit = ChatCubit(
      repository: ChatRepository(apiClient: api),
      realtimeClient: realtime,
    );

    await cubit.setWorkspace('workspace');
    expect(lists, 1);
    inbox.add(const ChatRealtimeResyncEvent());
    await _until(() => lists == 2);
    await Future<void>.delayed(const Duration(milliseconds: 30));
    expect(lists, 2);
    verify(() => realtime.connect(any())).called(1);
    verifyNoMoreInteractions(realtime);

    await inbox.close();
    await cubit.close();
  });

  test('a uuid thread opens its own room socket', () async {
    const roomId = '11111111-1111-4111-8111-111111111111';
    final api = _Api();
    final realtime = _Realtime();
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = invocation.positionalArguments.first as String;
      if (path.contains('/conversations?')) {
        return {
          'conversations': [
            {'id': roomId, 'wsId': 'workspace', 'type': 'direct'},
          ],
        };
      }
      if (path.contains('/messages')) return {'messages': <Object?>[]};
      return {};
    });
    when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
    when(() => realtime.connect(any())).thenAnswer((_) => const Stream.empty());
    when(
      () =>
          realtime.connect(any(), conversationId: any(named: 'conversationId')),
    ).thenAnswer((_) => const Stream.empty());
    final cubit = ChatCubit(
      repository: ChatRepository(apiClient: api),
      realtimeClient: realtime,
    );

    await cubit.setWorkspace('workspace', initialConversationId: roomId);
    verify(
      () => realtime.connect('workspace', conversationId: roomId),
    ).called(1);

    await cubit.close();
  });
}

Future<void> _until(bool Function() done) async {
  for (var attempt = 0; attempt < 50 && !done(); attempt++) {
    await Future<void>.delayed(Duration.zero);
  }
  expect(done(), isTrue);
}
