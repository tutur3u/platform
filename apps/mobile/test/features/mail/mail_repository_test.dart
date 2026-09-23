import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  late MockApiClient api;
  late MailRepository repository;
  setUp(() {
    api = MockApiClient();
    repository = MailRepository(apiClient: api);
  });

  test(
    'snooze sends the deadline in UTC with thread-scoped bulk action',
    () async {
      when(
        () => api.postJson(any(), any()),
      ).thenAnswer((_) async => <String, dynamic>{});
      final deadline = DateTime.utc(2026, 10, 1, 9);
      await repository.bulk(
        'ws',
        'box',
        ['thread'],
        'snooze',
        threads: true,
        snoozedUntil: deadline,
      );
      verify(
        () => api.postJson(
          '/api/v1/workspaces/ws/mail/mailboxes/box/threads/bulk',
          {
            'action': 'snooze',
            'threadIds': ['thread'],
            'snoozedUntil': deadline.toIso8601String(),
          },
        ),
      ).called(1);
    },
  );

  test('encodes workspace and mailbox segments independently', () async {
    when(() => api.getJson(any())).thenAnswer((_) async => <String, dynamic>{});
    await repository.list(
      'workspace/other',
      'box#other',
      folder: 'inbox',
      query: 'from:a+b@example.com & test',
      page: 2,
    );
    final path =
        verify(() => api.getJson(captureAny())).captured.single as String;
    final uri = Uri.parse(path);
    expect(uri.pathSegments, [
      'api',
      'v1',
      'workspaces',
      'workspace/other',
      'mail',
      'mailboxes',
      'box#other',
      'threads',
    ]);
    expect(uri.queryParameters['query'], 'from:a+b@example.com & test');
    expect(uri.queryParameters['page'], '2');
  });

  test('drafts use messages, while inbox uses threads', () async {
    when(() => api.getJson(any())).thenAnswer((_) async => <String, dynamic>{});
    await repository.list('ws', 'box', folder: 'drafts');
    final path =
        verify(() => api.getJson(captureAny())).captured.single as String;
    expect(
      Uri.parse(path).path,
      '/api/v1/workspaces/ws/mail/mailboxes/box/messages',
    );
    expect(Uri.parse(path).queryParameters['folder'], 'drafts');
  });

  test('editing a draft keeps its id and uses PATCH', () async {
    when(() => api.patchJson(any(), any())).thenAnswer(
      (_) async => {
        'message': {'id': 'draft'},
      },
    );
    await repository.saveDraft('ws', 'box', {
      'subject': 'Edited',
    }, draftId: 'draft');
    verify(
      () => api.patchJson(
        '/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft',
        {'subject': 'Edited'},
      ),
    ).called(1);
    verifyNever(() => api.postJson(any(), any()));
  });

  test('bulk threads are bounded to 100 ids per POST', () async {
    when(
      () => api.postJson(any(), any()),
    ).thenAnswer((_) async => {'updated': 100});
    final ids = List.generate(205, (i) => 'thread-$i');
    await repository.bulk('ws', 'box', ids, 'archive', threads: true);
    final requests = verify(
      () => api.postJson(
        '/api/v1/workspaces/ws/mail/mailboxes/box/threads/bulk',
        captureAny(),
      ),
    ).captured;
    expect(
      requests.map(
        (r) =>
            ((r as Map<String, dynamic>)['threadIds'] as List<String>).length,
      ),
      [100, 100, 5],
    );
    expect(
      requests.expand(
        (r) => (r as Map<String, dynamic>)['threadIds'] as List<String>,
      ),
      ids,
    );
  });

  test(
    'folder mark-read carries cursor and timestamp until complete',
    () async {
      var calls = 0;
      when(() => api.postJson(any(), any())).thenAnswer(
        (_) async => {
          'updated': 250,
          'before': '2026-09-18T00:00:00Z',
          'nextCursor': calls++ == 0 ? 'next' : null,
        },
      );
      await repository.markFolderRead('ws', 'box', 'inbox');
      final requests = verify(() => api.postJson(any(), captureAny())).captured;
      expect(requests, [
        {'folder': 'inbox'},
        {'folder': 'inbox', 'cursor': 'next', 'before': '2026-09-18T00:00:00Z'},
      ]);
    },
  );

  test('failed mutation remains a failure for UI rollback', () async {
    when(
      () => api.patchJson(any(), any()),
    ).thenThrow(const ApiException(message: 'Forbidden', statusCode: 403));
    await expectLater(
      repository.changeState('ws', 'box', 'thread', 'trash', thread: true),
      throwsA(isA<ApiException>()),
    );
  });
}
