import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_creation_receipt.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const ws = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const Map<String, String> raw = {
  'id': id,
  'wsId': ws,
  'type': 'ai',
  'createdAt': '2026-10-12T00:00:00Z',
  'updatedAt': '2026-10-12T00:00:00Z',
};
void main() {
  test('direct HTTP creation returns typed acknowledged receipt', () async {
    final api = _Api();
    when(
      () => api.postJson('/api/v1/workspaces/$ws/chat/conversations', any()),
    ).thenAnswer((_) async => {'conversation': raw});
    final result = await ChatRepository(apiClient: api)
        .createAcknowledgedConversation(
          ws,
          title: 'Fixture',
          modelId: 'synthetic/model',
        );
    expect(result.conversation.id, id);
    expect(result.conversation.wsId, ws);
    verify(
      () => api.postJson('/api/v1/workspaces/$ws/chat/conversations', any()),
    ).called(1);
  });
  for (final offset in [
    '+24:60',
    '+23:60',
    '-24:00',
    '+00:60',
    '-23:60',
    'Z',
    '+00:00',
    '+07:30',
    '-05:45',
    '+23:59',
  ]) {
    test('direct creation raw offset $offset', () async {
      final api = _Api();
      when(() => api.postJson(any(), any())).thenAnswer(
        (_) async => {
          'conversation': {...raw, 'createdAt': '2026-10-13T10:00:00$offset'},
        },
      );
      final result = ChatRepository(apiClient: api)
          .createAcknowledgedConversation(
            ws,
            title: 'Fixture',
            modelId: 'synthetic/model',
          );
      if (['+24:60', '+23:60', '-24:00', '+00:60', '-23:60'].contains(offset)) {
        await expectLater(result, throwsFormatException);
      } else {
        expect((await result).conversation.id, id);
      }
      verify(() => api.postJson(any(), any())).called(1);
    });
  }
  for (final change in [
    {'title': 42},
    {'description': 42},
    {'aiEnabled': 'true'},
    {'id': ''},
    {'id': ' $id'},
    {'id': 1},
    {'wsId': id},
    {'wsId': null},
    {'type': 'channel'},
    {'createdAt': null},
    {'createdAt': 1},
    {'createdAt': 'not-a-date'},
    {'createdAt': '2026-02-31T00:00:00Z'},
  ]) {
    test('strict raw receipt rejects $change', () {
      expect(
        () => AcknowledgedChatConversation.fromResponse({
          'conversation': {...raw, ...change},
        }, wsId: ws),
        throwsFormatException,
      );
    });
  }
  for (final response in [
    null,
    <String, Object?>{},
    {'conversation': null},
    {
      'conversation': {
        'id': id,
        'ws_id': ws,
        'type': 'ai',
        'updated_at': '2026-10-12T00:00:00Z',
      },
    },
  ]) {
    test('malformed/pending receipt is not acknowledged: $response', () {
      expect(
        () => AcknowledgedChatConversation.fromResponse(response, wsId: ws),
        throwsFormatException,
      );
    });
  }
  test(
    'unknown transport is not converted to placeholder or replayed',
    () async {
      final api = _Api();
      when(
        () => api.postJson(any(), any()),
      ).thenThrow(const ApiException.transport(message: 'Synthetic timeout'));
      await expectLater(
        ChatRepository(apiClient: api).createAcknowledgedConversation(
          ws,
          title: 'Fixture',
          modelId: 'synthetic/model',
        ),
        throwsA(isA<ApiException>()),
      );
      verify(() => api.postJson(any(), any())).called(1);
    },
  );
}
