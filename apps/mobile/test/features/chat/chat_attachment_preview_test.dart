import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test(
    'resolves a chat media URL through the authorized read endpoint',
    () async {
      final api = _Api();
      when(
        () => api.getJson(
          '/api/v1/workspaces/ws/chat/conversations/thread/attachments/photo',
        ),
      ).thenAnswer((_) async => {'signedUrl': 'https://media.example/photo'});

      final repository = ChatRepository(apiClient: api);
      expect(
        await repository.attachmentReadUrl('ws', 'thread', 'photo'),
        'https://media.example/photo',
      );
      verify(
        () => api.getJson(
          '/api/v1/workspaces/ws/chat/conversations/thread/attachments/photo',
        ),
      ).called(1);
      repository.dispose();
    },
  );

  test('rejects an attachment response without a signed URL', () async {
    final api = _Api();
    when(() => api.getJson(any())).thenAnswer((_) async => {});
    final repository = ChatRepository(apiClient: api);

    await expectLater(
      repository.attachmentReadUrl('ws', 'thread', 'missing'),
      throwsA(isA<ApiException>()),
    );
    repository.dispose();
  });
}
