import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Realtime extends Mock implements ChatRealtimeClient {}

void main() {
  for (final fail in [false, true]) {
    test(
      'old workspace page ${fail ? 'failure' : 'success'} cannot publish',
      () async {
        final api = _Api();
        final realtime = _Realtime();
        final pending = Completer<Map<String, dynamic>>();
        final started = Completer<void>();
        when(() => api.getJson(any())).thenAnswer((call) async {
          final path = call.positionalArguments.first as String;
          if (path.endsWith('/friend-requests')) return {};
          if (path.contains('offset=40')) {
            if (!started.isCompleted) started.complete();
            return await pending.future;
          }
          final workspace = path.contains('/new/') ? 'new' : 'old';
          return {
            'conversations': [
              {'id': workspace, 'wsId': workspace, 'type': 'direct'},
            ],
            'nextOffset': 40,
          };
        });
        when(
          () => realtime.connect(any()),
        ).thenAnswer((_) => const Stream.empty());
        final cubit = ChatCubit(
          repository: ChatRepository(apiClient: api),
          realtimeClient: realtime,
        );
        await cubit.setWorkspace('old');
        final loading = cubit.loadMoreConversations();
        await started.future;
        await cubit.setWorkspace('new');
        if (fail) {
          pending.completeError(
            const ApiException(message: 'Old request failed', statusCode: 500),
          );
        } else {
          pending.complete({
            'conversations': [
              {'id': 'stale', 'wsId': 'old', 'type': 'direct'},
            ],
          });
        }
        await loading;
        expect(cubit.state.wsId, 'new');
        expect(cubit.state.conversations.map((row) => row.id), ['new']);
        expect(cubit.state.error, isNull);
        expect(cubit.state.isLoadingMore, isFalse);
        await cubit.close();
      },
    );
  }
}
